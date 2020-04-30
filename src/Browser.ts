import {MDNS, ResponsePacket} from "multicast-dns";
import dnsEqual from "./utils/dnsEqual";
import {ARecord, PTRRecord, RecordType} from "dns-packet";
import {decodeTxtBlocks, TXTDecoderOptions} from "./utils/txtDecoder";
import {AddressInfo} from "net";
import serviceName from "multicast-dns-service-types";
import {EventEmitter} from "events";

const TLD = ".local";
const WILDCARD = "_services._dns-sd._udp" + TLD;

export interface BrowserOptions {
  name?: string;
  type?: string;
  subtypes?: string[];
  protocol?: "tcp" | "udp";
  txt?: TXTDecoderOptions;
}

export interface DiscoveredService {
  addresses: string[];
  name: string;
  fqdn: string;
  host: string;
  referer: AddressInfo;
  port: number;
  type: string;
  protocol: string;
  subtypes: string[];

  rawTxt: Buffer[];
  txt: Record<string, string>; // TODO if txt options are supplied this type might as well be Record<string, Buffer>
}

export const enum BrowserEvent {
  UP = "up",
  DOWN = "down",
}

export declare interface Browser {

  on(event: BrowserEvent.UP, listener: (service: DiscoveredService) => void): this;
  on(event: BrowserEvent.DOWN, listener: (service: DiscoveredService) => void): this;

  emit(event: BrowserEvent.UP, service: DiscoveredService): boolean;
  emit(event: BrowserEvent.DOWN, service: DiscoveredService): boolean;

}

/**
 * Start a browser
 *
 * The browser listens for services by querying for PTR records of a given
 * type, protocol and domain, e.g. _http._tcp.local.
 *
 * If no type is given, a wild card search is performed.
 *
 * An internal list of online services is kept which starts out empty. When
 * ever a new service is discovered, it's added to the list and an "up" event
 * is emitted with that service. When it's discovered that the service is no
 * longer available, it is removed from the list and a "down" event is emitted
 * with that service.
 */
export class Browser extends EventEmitter {

  private readonly mdns: MDNS;
  private readonly txtOptions?: TXTDecoderOptions;

  private readonly name: string;
  private readonly wildcard: boolean;

  private readonly serviceMap: Record<string, boolean> = {};
  private readonly services: DiscoveredService[] = [];

  private onResponse?: (packet: ResponsePacket, rinfo: AddressInfo) => void;

  constructor(mdns: MDNS, options?: BrowserOptions, onUp?: (service: DiscoveredService) => void) {
    super();

    this.mdns = mdns;
    this.txtOptions = options?.txt;

    if (!options || !options.type) {
      this.name = WILDCARD;
      this.wildcard = true;
    } else {
      this.name = serviceName.stringify(options.type, options.protocol || "tcp") + TLD;
      if (options.name) {
        this.name = options.name + "." + this.name;
      }
      this.wildcard = false;
    }

    if (onUp) {
      this.on(BrowserEvent.UP, onUp);
    }

    this.start();
  }

  start(): void {
    if (this.onResponse) {
      return;
    }

    // List of names for the browser to listen for. In a normal search this will
    // be the primary name stored on the browser. In case of a wildcard search
    // the names will be determined at runtime as responses come in.
    //const nameMap: Record<string, boolean> = {};
    const names: string[] = [];
    if (!this.wildcard) {
      names.push(this.name);
    }

    this.onResponse = (packet, rinfo): void => {
      if (this.wildcard) {
        packet.answers.forEach(answer => {
          if (answer.type !== RecordType.PTR || answer.name !== this.name || names.includes(answer.name)) {
            return;
          }
          names.push(answer.data);
          this.mdns.query(answer.data, RecordType.PTR);
        });
      }

      names.forEach(name => {
        // unregister all services shutting down
        Browser.goodbyes(name, packet).forEach(this._removeService.bind(this));

        // register all new services
        const matches = this.buildServicesFor(name, packet, rinfo);
        if (matches.length === 0) {
          return;
        }

        matches.forEach(service => {
          if (this.serviceMap[service.fqdn]) {
            return;
          } // ignore already registered services
          this._addService(service);
        });
      });
    };

    this.mdns.on("response", this.onResponse);
    this.update();
  }

  stop(): void {
    if (!this.onResponse) {
      return;
    }

    this.mdns.removeListener("response", this.onResponse);
    this.onResponse = undefined;
  }

  update(): void {
    this.mdns.query(this.name, RecordType.PTR);
  }

  _addService(service: DiscoveredService): void {
    this.services.push(service);
    this.serviceMap[service.fqdn] = true;
    this.emit(BrowserEvent.UP, service);
  }

  _removeService(fqdn: string): void {
    let service: DiscoveredService | undefined = undefined;
    let index = -1;

    this.services.some((s, i) => {
      if (dnsEqual(s.fqdn, fqdn)) {
        service = s;
        index = i;
        return true;
      }
    });
    if (!service || index < 0) {
      return;
    }

    this.services.splice(index, 1);
    delete this.serviceMap[fqdn];
    this.emit(BrowserEvent.DOWN, service);
  }

  // PTR records with a TTL of 0 is considered a "goodbye" announcement. I.e. a
  // DNS response broadcasted when a service shuts down in order to let the
  // network know that the service is no longer going to be available.
  //
  // For more info see:
  // https://tools.ietf.org/html/rfc6762#section-8.4
  //
  // This function returns an array of all resource records considered a goodbye
  // record
  static goodbyes(name: string, packet: ResponsePacket): string[] {
    return packet.answers.concat(packet.additionals!)
      .filter((rr) => {
        return rr.type === RecordType.PTR && rr.ttl === 0 && dnsEqual(rr.name, name);
      })
      .map((rr) => {
        return (rr as PTRRecord).data;
      });
  }

  private buildServicesFor(name: string, packet: ResponsePacket, referer: AddressInfo): DiscoveredService[] {
    const records = packet.answers.concat(packet.additionals).filter((rr) => {
      return rr.ttl && rr.ttl > 0; // ignore goodbye messages
    });

    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    return records
      .filter(rr => rr.type === RecordType.PTR && dnsEqual(rr.name, name))
      .map(ptr => {
        const service: Partial<DiscoveredService> = {
          addresses: [],
        };

        records
          .filter((rr) => {
            return (rr.type === "SRV" || rr.type === "TXT") && dnsEqual(rr.name, (ptr as PTRRecord).data);
          })
          .forEach((rr) => {
            if (rr.type === "SRV") {
              const parts = rr.name.split(".");
              const name = parts[0];
              const types = serviceName.parse(parts.slice(1, -1).join("."));
              service.name = name;
              service.fqdn = rr.name;
              service.host = rr.data.target;
              service.referer = referer;
              service.port = rr.data.port;
              service.type = types.name;
              service.protocol = types.protocol;
              service.subtypes = types.subtypes;
            } else if (rr.type === "TXT") {
              // rr.data is an Array of Buffer instead of Buffer
              service.rawTxt = rr.data as Buffer[]; // array of buffers, each representing a block
              if (this.txtOptions) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
                // @ts-ignore
                service.txt = decodeTxtBlocks(service.rawTxt, this.txtOptions);
              } else {
                service.txt = decodeTxtBlocks(service.rawTxt);
              }
            }
          });

        if (!service.name) {
          return undefined;
        }

        records
          .filter((rr) => {
            return (rr.type === RecordType.A || rr.type === RecordType.AAAA) && dnsEqual(rr.name, service.host!);
          })
          .forEach((rr) => {
            service.addresses!.push((rr as ARecord).data);
          });

        return service as DiscoveredService;
      })
      .filter(service => !!service);
  }

}
