import { useEffect, useRef } from 'react';
import { mountFamiliarCall } from '../../whip-whep/src/main.js';
import '../../whip-whep/src/styles.css';

/** React owns the host lifecycle; the shared browser core owns call/media UI. */
export function WhipWhepHost() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return undefined;
    const unmount = mountFamiliarCall(host.current);
    return unmount;
  }, []);

  return <div ref={host} data-framework-host="react" />;
}
