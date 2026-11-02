// Startup file for cPanel "Setup Node.js App" (Phusion Passenger).
// Passenger loads this file; it starts the real ES-module server.
import('./src/server.js').catch((err) => {
  console.error('Failed to start ICT Inspection API:', err);
  process.exit(1);
});
