/* eslint-disable @typescript-eslint/ban-ts-ignore */
import os from "os";
import dgram from "dgram";
import tape, {Test} from "tape";
// @ts-ignore
import afterAll from "after-all";
import {Bonjour} from "../src";
import {Service, ServiceEvent} from "../src/Service";
import {AddressInfo} from "net";
import {BrowserEvent, DiscoveredService} from "../src/Browser";
import Timeout = NodeJS.Timeout;

const getAddresses = (): string[] => {
  const addresses: string[] = [];
  const itrs = os.networkInterfaces();
  for (const i in itrs) {
    const addrs = itrs[i];
    for (const j in addrs) {
      if (addrs[j].internal === false) {
        addresses.push(addrs[j].address);
      }
    }
  }
  return addresses;
};

const port = (cb: (port: number) => void): void => {
  const s = dgram.createSocket("udp4");
  s.bind(0, () => {
    const port = (s.address() as AddressInfo).port;
    s.on("close", () => {
      cb(port);
    });
    s.close();
  });
};

const test = function (name: string, fn: (bonjour: Bonjour, t: Test) => void): void {
  tape(name, (t) => {
    port((p) => {
      fn(new Bonjour({ ip: "127.0.0.1", port: p, multicast: false }), t);
    });
  });
};

test("bonjour.publish", (bonjour, t) => {
  const service = bonjour.publish({ name: "foo", type: "bar", port: 3000 });
  t.ok(service instanceof Service);
  t.equal(service.published, false);
  service.on(ServiceEvent.UP, () => {
    t.equal(service.published, true);
    bonjour.destroy();
    t.end();
  });
});

test("bonjour.unpublishAll", (bonjour, t) => {
  t.test("published services", (t) => {
    const service = bonjour.publish({ name: "foo", type: "bar", port: 3000 });
    service.on(ServiceEvent.UP, () => {
      bonjour.unpublishAll((err) => {
        t.error(err);
        t.equal(service.published, false);
        bonjour.destroy();
        t.end();
      });
    });
  });

  t.test("no published services", (t) => {
    bonjour.unpublishAll((err) => {
      t.error(err);
      t.end();
    });
  });
});

test("bonjour.find", (bonjour, t) => {
  const next = afterAll(() => {
    const browser = bonjour.find({ type: "test" });
    let ups = 0;

    browser.on(BrowserEvent.UP, (s) => {
      if (s.name === "Foo Bar") {
        t.equal(s.name, "Foo Bar");
        t.equal(s.fqdn, "Foo Bar._test._tcp.local");
        t.deepEqual(s.txt, {});
        t.deepEqual(s.rawTxt, []);
      } else {
        t.equal(s.name, "Baz");
        t.equal(s.fqdn, "Baz._test._tcp.local");
        t.deepEqual(s.txt, { foo: "bar" });
        t.deepEqual(s.rawTxt, [Buffer.from("foo=bar")]);
      }
      t.equal(s.host, os.hostname());
      t.equal(s.port, 3000);
      t.equal(s.type, "test");
      t.equal(s.protocol, "tcp");
      t.equal(s.referer.address, "127.0.0.1");
      t.equal(s.referer.family, "IPv4");
      t.ok(Number.isFinite(s.referer.port));
      // @ts-ignore
      t.ok(Number.isFinite(s.referer.size));
      t.deepEqual(s.subtypes, []);
      t.deepEqual(s.addresses.sort(), getAddresses().sort());

      if (++ups === 2) {
        // use timeout in an attempt to make sure the invalid record doesn't
        // bubble up
        setTimeout(() => {
          bonjour.destroy();
          t.end();
        }, 50);
      }
    });
  });

  bonjour.publish({ name: "Foo Bar", type: "test", port: 3000 }).on(ServiceEvent.UP, next());
  bonjour.publish({ name: "Invalid", type: "test2", port: 3000 }).on(ServiceEvent.UP, next());
  bonjour.publish({ name: "Baz", type: "test", port: 3000, txt: { foo: "bar" } }).on(ServiceEvent.UP, next());
});

test("bonjour.change", (bonjour, t) => {
  const data: {
    browserData?: DiscoveredService;
    init: boolean;
    found: boolean;
    timer?: Timeout;
  } = {
    init: true,
    found: false,
  };

  const service = bonjour.publish({name: "Baz", type: "test", port: 3000, txt: {foo: "bar"}}).on(ServiceEvent.UP, () => {
    const browser = bonjour.find({type: "test"});
    // @ts-ignore
    browser.on("up", (s) => {
      data.browserData = s;

      if (data.init) {
        t.equal(s.txt.foo, "bar");
        data.timer = setTimeout(() => {
          t.equal(s.txt.foo, "baz");
          bonjour.destroy();
          t.end();
        }, 3000); // Wait for the record to update maximum 3000 ms
        data.init = false;
        service.updateTxt({foo: "baz"});
      }

      if (!data.init && !data.found && s.txt.foo === "baz") {
        data.found = true;
        clearTimeout(data.timer!);
        t.equal(s.txt.foo, "baz");
        bonjour.destroy();
        t.end();
      }
    });
  });
});

test("bonjour.find - binary txt", (bonjour, t) => {
  const next = afterAll(() => {
    const browser = bonjour.find({ type: "test", txt: { binary: true } });

    browser.on(BrowserEvent.UP, (s) => {
      t.equal(s.name, "Foo");
      t.deepEqual(s.txt, { bar: Buffer.from("buz") });
      t.deepEqual(s.rawTxt, [Buffer.from("bar=buz")]);
      bonjour.destroy();
      t.end();
    });
  });

  bonjour.publish({ name: "Foo", type: "test", port: 3000, txt: { bar: Buffer.from("buz") } }).on(ServiceEvent.UP, next());
});

test("bonjour.find - down event", (bonjour, t) => {
  const service = bonjour.publish({ name: "Foo Bar", type: "test", port: 3000 });

  service.on(ServiceEvent.UP, () => {
    const browser = bonjour.find({ type: "test" });

    browser.on(BrowserEvent.UP, (s) => {
      t.equal(s.name, "Foo Bar");
      service.stop();
    });

    browser.on(BrowserEvent.DOWN, (s) => {
      t.equal(s.name, "Foo Bar");
      bonjour.destroy();
      t.end();
    });
  });
});

test("bonjour.findOne - callback", (bonjour, t) => {
  const next = afterAll(() => {
    bonjour.findOne({ type: "test" }, (s) => {
      t.equal(s.name, "Callback");
      bonjour.destroy();
      t.end();
    });
  });

  bonjour.publish({ name: "Invalid", type: "test2", port: 3000 }).on(ServiceEvent.UP, next());
  bonjour.publish({ name: "Callback", type: "test", port: 3000 }).on(ServiceEvent.UP, next());
});

test("bonjour.findOne - emitter", (bonjour, t) => {
  const next = afterAll(() => {
    const browser = bonjour.findOne({ type: "test" });
    browser.on(BrowserEvent.UP, (s) => {
      t.equal(s.name, "Emitter");
      bonjour.destroy();
      t.end();
    });
  });

  bonjour.publish({ name: "Emitter", type: "test", port: 3000 }).on(ServiceEvent.UP, next());
  bonjour.publish({ name: "Invalid", type: "test2", port: 3000 }).on(ServiceEvent.UP, next());
});
