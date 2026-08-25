export type PreparedVideo<T> = {
  stream: T | null;
  isLocal?: boolean;
  participantName?: string;
};

export type Presentation<T> = {
  primary: PreparedVideo<T> | null;
  previews: PreparedVideo<T>[];
  mode: 'screen' | 'remote-camera' | 'local-camera' | 'audio-only';
};

export function resolvePresentation<T>(input: {
  screen: PreparedVideo<T>;
  remotes: PreparedVideo<T>[];
  local: PreparedVideo<T> | null;
}): Presentation<T> {
  const remotes = input.remotes.filter((item) => item.stream);
  if (input.screen.stream) {
    return {
      primary: input.screen,
      previews: [...remotes, ...(input.local?.stream ? [input.local] : [])],
      mode: 'screen',
    };
  }
  if (remotes.length) {
    return {
      primary: remotes[0],
      previews: [...remotes.slice(1), ...(input.local?.stream ? [input.local] : [])],
      mode: 'remote-camera',
    };
  }
  return input.local?.stream
    ? { primary: input.local, previews: [], mode: 'local-camera' }
    : { primary: null, previews: [], mode: 'audio-only' };
}
