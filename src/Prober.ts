import dnsEqual from "./utils/dnsEqual";
import Timeout = NodeJS.Timeout;
import {MDNS, ResponsePacket} from "multicast-dns";
import {Service} from "./Service";
import {ResourceRecord} from "dns-packet";

export type ProberCallback = (exists: boolean) => void;

/**
 * Check if a service name is already in use on the network.
 *
 * Used before announcing the new service.
 *
 * To guard against race conditions where multiple services are started
 * simultaneously on the network, wait a random amount of time (between
 * 0 and 250 ms) before probing.
 *
 * TODO: Add support for Simultaneous Probe Tiebreaking:
 * https://tools.ietf.org/html/rfc6762#section-8.2
 */
export class Prober {

  private readonly mdns: MDNS;
  private readonly service: Service;
  private readonly callback: ProberCallback;

  private readonly responseListener: (packet: ResponsePacket) => void;
  private readonly rrMatcher: (rr: ResourceRecord) => boolean;

  private timer?: Timeout;
  private sent = false;
  private retries = 0;

  constructor(mdns: MDNS, service: Service, callback: ProberCallback) {
    this.mdns = mdns;
    this.service = service;
    this.callback = callback;

    this.responseListener = this.onMDNSResponse.bind(this);
    this.rrMatcher = this.matchRR.bind(this);
  }

  public start(): void {
    this.mdns.on("response", this.responseListener);
    setTimeout(() => this.try(), Math.random() * 250);
  }

  private try(): void {
    // abort if the service have or is being stopped in the meantime
    if (!this.service.activated || this.service.destroyed) {
      return;
    }

    this.mdns.query(this.service.fqdn, "ANY", () => {
      // This function will optionally be called with an error object. We'll
      // just silently ignore it and retry as we normally would
      this.sent = true;
      this.timer = setTimeout(++this.retries < 3 ? this.try.bind(this) : this.done.bind(this, false), 250);
      this.timer.unref();
    });
  }

  private onMDNSResponse(packet: ResponsePacket): void {
    // Apparently conflicting Multicast DNS responses received *before*
    // the first probe packet is sent MUST be silently ignored (see
    // discussion of stale probe packets in RFC 6762 Section 8.2,
    // "Simultaneous Probe Tiebreaking" at
    // https://tools.ietf.org/html/rfc6762#section-8.2
    if (!this.sent) {
      return;
    }

    if (packet.answers.some(this.rrMatcher) || packet.additionals.some(this.rrMatcher)) {
      this.done(true);
    }
  }

  private matchRR(rr: ResourceRecord): boolean {
    return dnsEqual(rr.name, this.service.fqdn);
  }

  private done(exists: boolean): void {
    this.mdns.removeListener("response", this.responseListener);
    clearTimeout(this.timer!);
    this.callback(exists);
  }

}
