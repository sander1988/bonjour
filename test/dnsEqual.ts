import test = require("tape");
import dnsEqual from "../src/utils/dnsEqual";

test("dns-equal", t => {
  t.equal(dnsEqual("Foo", "foo"), true);
  t.equal(dnsEqual("FooÆØÅ", "fooÆØÅ"), true);

  t.equal(dnsEqual("foo", "bar"), false);
  t.equal(dnsEqual("FooÆØÅ", "fooæøå"), false);
  t.equal(dnsEqual("café", "cafe"), false);
  t.end();
});
