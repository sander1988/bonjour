declare module "multicast-dns-service-types" {

  export interface ServiceData {
    name: string;
    protocol: "udp" | "tcp";
    subtypes?: string[];
  }

  export function stringify(data: ServiceData): string;
  export function stringify(name: string, protocol: "udp" | "tcp", subtypes?: string[]): string;

  export function tcp(name: string, ...subtypes: string[]): string;
  export function udp(name: string, ...subtypes: string[]): string;

  export function parse(str: string): ServiceData;
}
