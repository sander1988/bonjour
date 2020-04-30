import {Server} from "./Server";
import {MDNSOptions} from "multicast-dns";
import {Registry} from "./Registry";
import {Browser, BrowserOptions, DiscoveredService} from "./Browser";
import {Service, ServiceOptions} from "./Service";

export class Bonjour {

  private readonly server: Server;
  private readonly registry: Registry;

  constructor(options?: MDNSOptions) {
    this.server = new Server(options);
    this.registry = new Registry(this.server);
  }

  publish(opts: ServiceOptions): Service {
    return this.registry.publish(opts);
  }

  unpublishAll(callback?: (error?: Error) => void): void {
    this.registry.unpublishAll(callback);
  }

  find(options?: BrowserOptions, onUp?: (service: DiscoveredService) => void): Browser {
    return new Browser(this.server.mdns, options, onUp);
  }

  findOne(options?: BrowserOptions, onUp?: (service: DiscoveredService) => void): Browser {
    const browser = new Browser(this.server.mdns, options);

    browser.once("up", service => {
      browser.stop();
      if (onUp) {
        onUp(service);
      }
    });

    return browser;
  }

  destroy(): void {
    this.registry.destroy();
    this.server.mdns.destroy();
  }

}

export default function (options?: MDNSOptions): Bonjour {
  return new Bonjour(options);
}
