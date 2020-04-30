declare module "dns-packet" {

  export const enum RecordType { // rrtype
    ALL = "ALL", // TODO remove, and what is about "ANY"?
    A = "A",
    AAAA = "AAAA",
    CAA = "CAA",
    CNAME = "CNAME",
    DNAME = "DNAME",
    DNSKEY = "DNSKEY",
    DS = "DS",
    HINFO = "HINFO",
    MX = "MX",
    NS = "NS",
    NSEC = "NSEC",
    NSEC3 = "NSEC3",
    NULL = "NULL",
    OPT = "OPT",
    PTR = "PTR",
    RP = "RP",
    PRSIG = "PRSIG",
    SOA = "SOA",
    SRV = "SRV",
    TXT = "TXT",
  }

  export const enum Class { // rrclass
    IN = "IN",
    CS = "CS",
    CH = "CH",
    HS = "HS",
    ANY = "ANY",
  }

  export interface DNSQuestion {
    type: RecordType | "ANY"; // qtype
    name: string;
    class?: Class; // qclass, default IN
  }


  // rr
  export type ResourceRecord = ARecord | AAAARecord | HINFORecord | PTRRecord | SRVRecord | TXTRecord; // list of records is incomplete

  export interface RecordBase {
    type: RecordType; // rrtype
    name: string;
    class?: Class; // rrclass, default IN
    ttl?: number;
  }

  export interface ARecord extends RecordBase {
    type: RecordType.A;
    data: string; // ipv4 address
  }

  export interface AAAARecord extends RecordBase {
    type: RecordType.AAAA;
    data: string; // ipv6 address
  }

  export interface HINFORecord extends RecordBase {
    type: RecordType.HINFO;
    data: {
      cpu: string;
      os: string;
    };
  }

  export interface PTRRecord extends RecordBase {
    type: RecordType.PTR;
    data: string; // pointer to another record
  }

  export interface SRVRecord extends RecordBase {
    type: RecordType.SRV;
    data: {
      port: number;
      target: string; // hostname
      priority?: unknown; // TODO type
      weight?: unknown; // TODO type
    };
  }

  export interface TXTRecord extends RecordBase {
    type: RecordType.TXT;
    data: string | Buffer | (string | Buffer)[]; // when decoding value will always be Buffer array
  }

}
