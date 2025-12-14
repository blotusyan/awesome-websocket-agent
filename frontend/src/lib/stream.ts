export type ParsedEvent = {
  event: string;
  data: string;
};

export const parseSseChunk = (chunk: string): ParsedEvent => {
  const lines = chunk.split(/\r?\n/);
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      const value = line.slice("data:".length).trim();
      data += value;
    }
  }
  return { event, data };
};
