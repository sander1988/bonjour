const equalSign = Buffer.from("=");

export interface TXTDecoderOptions {
  binary?: boolean; // just pass values as buffers
}

export function decodeTxtBlocks(buffers: Buffer[]): Record<string, string>;
export function decodeTxtBlocks(buffers: Buffer[], options: TXTDecoderOptions): Record<string, Buffer>;
export function decodeTxtBlocks(buffers: Buffer[], options?: TXTDecoderOptions): Record<string, string> | Record<string, Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};

  buffers.forEach(buf => {
    if (buf.length === 0) {
      return; // ignore: most likely a single zero byte
    }

    const i = buf.indexOf(equalSign);

    if (i === -1) { // equal sign does not exist
      data[buf.toString().toLowerCase()] = true;
    } else if (i > 0) { // check if it isn't a zero length ke, otherwise we would ignore those
      const key = buf.slice(0, i).toString().toLowerCase();

      if (key in data) { // overwriting not allowed
        return;
      }

      const valueBuf = buf.slice(i + 1);
      data[key] = options && options.binary ? valueBuf : valueBuf.toString();
    }
  });

  return data;
}
