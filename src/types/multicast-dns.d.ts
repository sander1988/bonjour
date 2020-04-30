declare module "multicast-dns" {

  import {DNSQuestion, RecordType, ResourceRecord} from "dns-packet";
  import {EventEmitter} from "events";
  import {AddressInfo} from "net";

  export interface MDNSOptions {
    multicast?: boolean; // use udp multicasting, default true
    interface?: string; // explicitly specify a network interface. defaults to all
    port?: number; // set the udp port, default 5353
    ip?: string; // set the udp multicast ip, default 224.0.0.251
    ttl?: number; // set the multicast ttl, default 255 (should actually not be changed)
    loopback?: boolean; // receive your own packets, default true
    reuseAddr?: boolean; // set the reuseAddr option when creating the socket (requires node >=0.11.13)
  }

  export interface QueryPacket {
    questions: DNSQuestion[];
  }

  export interface ResponsePacket {
    answers: ResourceRecord[];
    additionals: ResourceRecord[];
    authorities?: ResourceRecord[];
  }

  export enum MDNSEvent {
    QUERY = "query",
    RESPONSE = "response",
    PACKET = "packet",
    ERROR = "error", // TODO ?
  }

  export interface SenderInfo { // basically a AddressInfo type without the family property
    address: string;
    port: number;
  }

  export class MDNS extends EventEmitter {

    constructor(options?: MDNSOptions);

    on(event: "query", listener: (packet: QueryPacket, rinfo: AddressInfo) => void): this;
    on(event: "response", listener: (packet: ResponsePacket, rinfo: AddressInfo) => void): this;


    query(name: string, type: RecordType | "ANY", callback?: (error?: Error) => void): void;
    query(name: string, type: RecordType | "ANY", senderInfo: SenderInfo, callback?: (error?: Error) => void): void;

    query(questions: DNSQuestion[], callback?: (error?: Error) => void): void;
    query(questions: DNSQuestion[], senderInfo: SenderInfo, callback?: (error?: Error) => void): void;

    query(packet: QueryPacket, callback?: (error?: Error) => void): void;
    query(packet: QueryPacket, senderInfo: SenderInfo, callback?: (error?: Error) => void): void;

    respond(answers: ResourceRecord[], callback?: (error?: Error) => void): void;
    respond(answers: ResourceRecord[], senderInfo: SenderInfo, callback?: (error?: Error) => void): void;

    respond(packet: ResponsePacket, callback?: (error?: Error) => void): void;
    respond(packet: ResponsePacket, senderInfo: SenderInfo, callback?: (error?: Error) => void): void;


    /**
     * This method is called every 5s and checks for new interfaces appearing on the machine to add it as a membership
     * to the dgram socket.
     */
    private update(): void;

    /**
     * Closes the socket
     * @param callback
     */
    destroy(callback?: () => void): void;

  }

  function multicastdns(options?: MDNSOptions): MDNS;

  export default multicastdns;

}
