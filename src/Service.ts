import os from "os";
import {EventEmitter} from "events";
import {AAAARecord, ARecord, ResourceRecord, PTRRecord, RecordType, SRVRecord, TXTRecord} from "dns-packet";
import serviceName from "multicast-dns-service-types";
import Timeout = NodeJS.Timeout;

const TLD = ".local";
const REANNOUNCE_MAX_MS = 60 * 60 * 1000;
const REANNOUNCE_FACTOR = 3;

export const enum Protocol {
  TCP = "tcp",
  UDP = "udp",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceTXT = Record<string, any>;

export interface ServiceOptions {
  name: string;
  type: string;
  port: number;
  protocol?: Protocol;
  host?: string;
  probe?: boolean;
  subtypes?: string[];
  txt?: ServiceTXT;
}

export const enum ServiceEvent {
  PUBLISH = "service-publish",
  UNPUBLISH = "service-unpublish",
  ANNOUNCE_REQUEST = "service-announce-request",
  PACKET_CHANGE = "service-packet-change",
  UP = "up",
  ERROR = "error",
}

export declare interface Service {

  on(event: ServiceEvent.PUBLISH, listener: () => void): this;
  on(event: ServiceEvent.UNPUBLISH, listener: (callback?: (error?: Error) => void) => void): this;
  on(event: ServiceEvent.ANNOUNCE_REQUEST, listener: (packet: ResourceRecord[], callback: () => void) => void): this;
  on(event: ServiceEvent.PACKET_CHANGE, listener: (packet: ResourceRecord[], callback: () => void) => void): this;
  on(event: ServiceEvent.ERROR, listener: (error: Error) => void): this;
  on(event: ServiceEvent.UP, listener: () => void): this;

  emit(event: ServiceEvent.PUBLISH): boolean;
  emit(event: ServiceEvent.UNPUBLISH, callback?: (error?: Error) => void): boolean;
  emit(event: ServiceEvent.ANNOUNCE_REQUEST, packet: ResourceRecord[], callback: () => void): boolean;
  emit(event: ServiceEvent.PACKET_CHANGE, packet: ResourceRecord[], callback: () => void): boolean;
  emit(event: ServiceEvent.ERROR, error: Error): boolean;
  emit(event: ServiceEvent.UP): boolean;

}

export class Service extends EventEmitter {

  private readonly name: string;
  private readonly protocol: Protocol;
  private readonly type: string;
  private readonly host: string;
  private readonly port: number;
  readonly fqdn: string;
  private readonly subtypes?: string[];
  private txt?: ServiceTXT; // TODO maybe string, for people "find"ing

  readonly probe: boolean = true;

  private packet?: ResourceRecord[];
  private delay?: number;
  private timer?: Timeout;

  published = false;
  activated = false; // indicates intent - true: starting/started, false: stopping/stopped
  destroyed = false;

  constructor(options: ServiceOptions) {
    super();
    if (!options) {
      throw new Error("options is required");
    }
    if (!options.name) {
      throw new Error("Required name not given");
    }
    if (!options.type) {
      throw new Error("Required type not given");
    }
    if (!options.port) {
      throw new Error("Required port not given");
    }

    this.name = options.name;
    this.protocol = options.protocol || Protocol.TCP;
    this.type = serviceName.stringify(options.type, this.protocol);
    this.host = options.host || os.hostname();
    this.port = options.port;
    this.fqdn = this.name + "." + this.type + TLD;
    if (options.subtypes) {
      this.subtypes = options.subtypes;
    }
    if (options.txt) {
      this.txt = options.txt;
    }

    if (options.probe === false) {
      this.probe = false;
    }
  }

  public start(): void {
    if (this.activated) {
      return;
    }

    this.activated = true;
    this.emit(ServiceEvent.PUBLISH);
  }

  public stop(cb?: () => void): void {
    if (!this.activated) {
      return;
    } // cb && cb('Not active'); // TODO: What about the callback?

    this.emit(ServiceEvent.UNPUBLISH, cb);
  }

  public updateTxt(txt: ServiceTXT): void {
    if (this.packet) {
      this.emit(ServiceEvent.PACKET_CHANGE, this.packet, this.onAnnounceComplete.bind(this));
    }
    this.packet = undefined;
    this.txt = txt;

    if (!this.published) {
      return;
    }

    this._unpublish();
    this.announce();
  }

  public announce(): void {
    if (this.destroyed) {
      return;
    }

    if (!this.packet) {
      this.packet = this._records();
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.delay = 1000;
    this.emit(ServiceEvent.ANNOUNCE_REQUEST, this.packet, this.onAnnounceComplete.bind(this));
  }

  private onAnnounceComplete(): void {
    if (!this.published) {
      this.activated = true; // not sure if this is needed here
      this.published = true;
      this.emit(ServiceEvent.UP);
    }

    this.delay = this.delay! * REANNOUNCE_FACTOR;
    if (this.delay < REANNOUNCE_MAX_MS && !this.destroyed && this.activated) {
      this.timer = setTimeout(this.announce.bind(this), this.delay).unref();
    } else {
      this.timer = undefined;
      this.delay = undefined;
    }
  }

  deactivate(): void {
    this._unpublish();
    this.activated = false;
  }

  destroy(): void {
    this._unpublish();
    this.removeAllListeners();
    this.destroyed = true;
  }

  private _unpublish(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.published = false;
  }

  _records(): ResourceRecord[] {
    const records: ResourceRecord[] = [this.recordPTR(), this.recordSRV(), this.recordTXT()];

    Object.values(os.networkInterfaces()).forEach(interfaces => {
      interfaces.forEach(networkInterface => {
        if (networkInterface.internal) {
          return;
        }

        records.push(networkInterface.family === "IPv4"
          ? this.recordA(networkInterface.address)
          : this.recordAAAA(networkInterface.address));
      });
    });

    return records;
  }

  private recordPTR(): PTRRecord {
    return {
      name: this.type + TLD,
      type: RecordType.PTR,
      ttl: 28800,
      data: this.fqdn,
    };
  }

  private recordSRV(): SRVRecord {
    return {
      name: this.fqdn,
      type: RecordType.SRV,
      ttl: 120,
      data: {
        port: this.port,
        target: this.host,
      },
    };
  }

  private recordTXT(): TXTRecord {
    const data: string[] = [];
    if (this.txt) {
      Object.entries(this.txt).forEach(([key, value]) => {
        data.push(key + "=" + value);
      });
    }

    return {
      name: this.fqdn,
      type: RecordType.TXT,
      ttl: 120,
      data: data,
    };
  }

  private recordA(ip: string): ARecord {
    return {
      name: this.host,
      type: RecordType.A,
      ttl: 120,
      data: ip,
    };
  }

  private recordAAAA(ip: string): AAAARecord {
    return {
      name: this.host,
      type: RecordType.AAAA,
      ttl: 120,
      data: ip,
    };
  }

}
