import { createRoot } from 'react-dom/client';
import { WhipWhepHost } from './WhipWhepHost';

// Deliberately omit StrictMode: its development-only double mount would open,
// close, and reopen browser media while testing the same real call.
createRoot(document.getElementById('root')!).render(<WhipWhepHost />);
