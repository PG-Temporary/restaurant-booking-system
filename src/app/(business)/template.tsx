// A template re-mounts on every navigation, which replays the entrance animation.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
