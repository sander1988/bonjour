import {Server} from "./Server";
import {Service, ServiceEvent, ServiceOptions} from "./Service";
import {Prober} from "./Prober";
import {ResourceRecord} from "dns-packet";

export class Registry {

  private readonly server: Server;
  private services: Service[] = [];

  constructor(server: Server) {
    this.server = server;
  }

  public publish(opts: ServiceOptions): Service {
    const service = new Service(opts);

    service.on(ServiceEvent.PUBLISH, this._onServicePublish.bind(this, service));
    service.on(ServiceEvent.UNPUBLISH, this._onServiceUnpublish.bind(this, service));
    service.on(ServiceEvent.ANNOUNCE_REQUEST, this._onAnnounceRequest.bind(this));
    service.on(ServiceEvent.PACKET_CHANGE, this._onServiceChange.bind(this));
    service.start();

    return service;
  }

  unpublishAll(callback?: (error?: Error) => void): void {
    this._tearDown(this.services, callback);
    this.services = [];
  }

  destroy(): void {
    for (let i = 0; i < this.services.length; i++) {
      this.services[i].destroy();
    }
  }

  /**
   * Stop the given services
   *
   * Besides removing a service from the mDNS registry, a "goodbye"
   * message is sent for each service to let the network know about the
   * shutdown.
   */
  _tearDown(services: Service[] | Service, callback?: (error?: Error) => void): void {
    if (!Array.isArray(services)) {
      services = [services];
    }

    services = services.filter((service) => {
      return service.activated; // ignore services not currently starting or started
    });

    const records: ResourceRecord[] = [];
    services.forEach(service => {
      const serviceRecords = service._records();
      serviceRecords.forEach(rr => rr.ttl = 0); // prepare goodbye message

      records.push(...serviceRecords);
    });

    if (records.length === 0) {
      return callback && callback();
    }

    this.server.unregister(records);

    this.server.mdns.respond(records, this._onTearDownComplete.bind(this, services, callback));
  }

  _onTearDownComplete(services: Service[], callback?: (error?: Error) => void, error?: Error): void {
    for (let i = 0; i < services.length; i++) {
      services[i].published = false;
    }

    if (callback) {
      callback(error);
    }
  }

  _onServiceChange(oldPackets: ResourceRecord[]): void {
    this.server.unregister(oldPackets);
  }

  /**
   * Initial service announcement
   *
   * Used to announce new services when they are first registered.
   *
   * Broadcasts right away, then after 3 seconds, 9 seconds, 27 seconds,
   * and so on, up to a maximum interval of one hour.
   */
  _onAnnounceRequest(packet: ResourceRecord[], callback: () => void): void {
    this.server.register(packet);
    this.server.mdns.respond(packet, callback);
  }

  _onServiceUnpublish(service: Service, callback?: (error?: Error) => void): void {
    const index = this.services.indexOf(service);

    this._tearDown(service, callback);

    if (index !== -1) {
      this.services.splice(index, 1);
    }
  }

  private _onServicePublish(service: Service): void {
    this.services.push(service);

    if (service.probe) {
      new Prober(this.server.mdns, service, this._onProbeComplete.bind(this, service)).start();
    } else {
      service.announce();
    }
  }

  _onProbeComplete(service: Service, exists: boolean): void {
    if (!exists) {
      return service.announce();
    }

    // Handle error
    service.stop();
    service.emit(ServiceEvent.ERROR, new Error("Service name is already in use on the network"));
  }

}
