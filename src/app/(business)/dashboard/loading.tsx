export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading bookings">
      <div className="skel" style={{ minHeight: 64, maxWidth: 480, marginBottom: 22 }} />
      <div className="stats"><div className="skel" style={{ minHeight: 84 }} /><div className="skel" style={{ minHeight: 84 }} /><div className="skel" style={{ minHeight: 84 }} /></div>
      <div className="skel" style={{ minHeight: 420 }} />
    </div>
  );
}
