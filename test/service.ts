/* eslint-disable @typescript-eslint/ban-ts-ignore */
import os from "os";
import test from "tape";
import {Protocol, Service} from "../src/Service";

const getAddressesRecords = (host: string) => {
  const records = [];
  const itrs = os.networkInterfaces();
  for (const i in itrs) {
    const addrs = itrs[i];
    for (const j in addrs) {
      if (addrs[j].internal === false) {
        records.push({ data: addrs[j].address, name: host, ttl: 120, type: addrs[j].family === "IPv4" ? "A" : "AAAA" });
      }
    }
  }
  return records;
};

test("no name", (t) => {
  t.throws(() => {
    // @ts-ignore
    new Service({ type: "http", port: 3000 }); // eslint-disable-line no-new
  }, "Required name not given");
  t.end();
});

test("no type", (t) => {
  t.throws(() => {
    // @ts-ignore
    new Service({ name: "Foo Bar", port: 3000 }); // eslint-disable-line no-new
  }, "Required type not given");
  t.end();
});

test("no port", (t) => {
  t.throws(() => {
    // @ts-ignore
    new Service({ name: "Foo Bar", type: "http" }); // eslint-disable-line no-new
  }, "Required port not given");
  t.end();
});

test("minimal", (t) => {
  const s = new Service({ name: "Foo Bar", type: "http", port: 3000 });
  // @ts-ignore
  t.equal(s.name, "Foo Bar");
  // @ts-ignore
  t.equal(s.protocol, "tcp");
  // @ts-ignore
  t.equal(s.type, "_http._tcp");
  // @ts-ignore
  t.equal(s.host, os.hostname());
  // @ts-ignore
  t.equal(s.port, 3000);
  t.equal(s.fqdn, "Foo Bar._http._tcp.local");
  // @ts-ignore
  t.equal(s.txt, null);
  // @ts-ignore
  t.equal(s.subtypes, null);
  t.equal(s.published, false);
  t.end();
});

test("protocol", (t) => {
  const s = new Service({ name: "Foo Bar", type: "http", port: 3000, protocol: Protocol.UDP });
  // @ts-ignore
  t.deepEqual(s.protocol, "udp");
  t.end();
});

test("host", (t) => {
  const s = new Service({ name: "Foo Bar", type: "http", port: 3000, host: "example.com" });
  // @ts-ignore
  t.deepEqual(s.host, "example.com");
  t.end();
});

test("txt", (t) => {
  const s = new Service({ name: "Foo Bar", type: "http", port: 3000, txt: { foo: "bar" } });
  // @ts-ignore
  t.deepEqual(s.txt, { foo: "bar" });
  t.end();
});

test("_records() - minimal", (t) => {
  const s = new Service({ name: "Foo Bar", type: "http", protocol: Protocol.TCP, port: 3000 });
  t.deepEqual(s._records(), [
    { data: s.fqdn, name: "_http._tcp.local", ttl: 28800, type: "PTR" },
    { data: { port: 3000, target: os.hostname() }, name: s.fqdn, ttl: 120, type: "SRV" },
    { data: [], name: s.fqdn, ttl: 120, type: "TXT" },
  ]
    // @ts-ignore
    .concat(getAddressesRecords(s.host)));
  t.end();
});

test("_records() - everything", (t) => {
  const s = new Service({ name: "Foo Bar", type: "http", protocol: Protocol.TCP, port: 3000, host: "example.com", txt: { foo: "bar" } });
  t.deepEqual(s._records(), [
    { data: s.fqdn, name: "_http._tcp.local", ttl: 28800, type: "PTR" },
    { data: { port: 3000, target: "example.com" }, name: s.fqdn, ttl: 120, type: "SRV" },
    { data: ["foo=bar"], name: s.fqdn, ttl: 120, type: "TXT" },
  ]
    // @ts-ignore
    .concat(getAddressesRecords(s.host)));
  t.end();
});
