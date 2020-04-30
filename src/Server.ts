import multicastdns, {MDNS, MDNSOptions, QueryPacket} from "multicast-dns";
import {duplicateRecordComparator, uniqueComparator} from "./utils/helpers";
import {RecordType, ResourceRecord, SRVRecord} from "dns-packet";
import dnsEqual from "./utils/dnsEqual";

export class Server {

  readonly mdns: MDNS;
  private readonly registry: Record<string, ResourceRecord[]> = {}; // indexed by RecordType

  constructor(options?: MDNSOptions) {
    this.mdns = multicastdns(options);
    this.mdns.setMaxListeners(0);
    this.mdns.on("query", this._respondToQuery.bind(this));
  }

  private _respondToQuery(query: QueryPacket): void {
    query.questions.forEach(question => {
      const type = question.type;
      const name = question.name;

      // generate the answers section
      const answers = this.recordsFor(name, type);
      if (answers.length === 0) {
        return;
      }

      // generate the additionals section
      let additionals: ResourceRecord[] = [];
      if (type !== "ANY") {
        answers.forEach((answer) => {
          if (answer.type !== RecordType.PTR) {
            return;
          }
          additionals = additionals
            .concat(this.recordsFor(answer.data, RecordType.SRV))
            .concat(this.recordsFor(answer.data, RecordType.TXT));
        });

        // to populate the A and AAAA records, we need to get a set of unique
        // targets from the SRV record
        additionals
          .filter((record) => {
            return record.type === RecordType.SRV;
          })
          .map((record) => {
            return (record as SRVRecord).data.target;
          })
          .filter(uniqueComparator())
          .forEach((target) => {
            additionals = additionals
              .concat(this.recordsFor(target, RecordType.A))
              .concat(this.recordsFor(target, RecordType.AAAA));
          });
      }

      this.mdns.respond({
        answers: answers,
        additionals: additionals,
      }, (err) => {
        if (err) {
          throw err;
        } // TODO: Handle this (if no callback is given, the error will be ignored)
      });
    });
  }

  public register(records: ResourceRecord[] | ResourceRecord): void {
    if (!Array.isArray(records)) {
      records = [records];
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      let subRegistry = this.registry[record.type];

      if (!subRegistry) {
        subRegistry = this.registry[record.type] = [];
      } else if (subRegistry.some(duplicateRecordComparator(record))) {
        return;
      }

      subRegistry.push(record);
    }
  }

  public unregister(records: ResourceRecord[] | ResourceRecord): void {
    if (!Array.isArray(records)) {
      records = [records];
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const type = record.type;

      if (!(type in this.registry)) {
        return;
      }

      this.registry[type] = this.registry[type].filter((r) => {
        return r.name !== record.name;
      });
    }
  }

  private recordsFor(name: string, type: RecordType | "ANY"): ResourceRecord[] {
    let result: ResourceRecord[];

    if (type === "ANY") {
      result = [];
      Object.values(this.registry).forEach(records => result.push(...records));
    } else if (this.registry[type]) {
      result = this.registry[type];
    } else {
      result = [];
    }

    return result.filter((record: ResourceRecord) => {
      const recordName = ~name.indexOf(".") ? record.name : record.name.split(".")[0];
      return dnsEqual(recordName, name);
    });
  }

}
