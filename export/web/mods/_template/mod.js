// Runs once after Kino has loaded. `api` is documented in mods/README.md.
export default function setup(api) {
  const { session, host, toast } = api;

  host.on('start', () => toast('My mod is running'));
  host.on('kill', ({ kind, head }) => {
    // e.g. bonus points for headshots:
    // if (head) session.addPoints(20);
  });
  host.on('roundEnd', ({ round }) => {});
  host.on('update', dt => {});
}
