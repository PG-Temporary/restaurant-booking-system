// Skeletons that match the shape of the result cards.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading results">
      <div className="skel" style={{ minHeight: 56, maxWidth: 420, marginBottom: 22 }} />
      <div className="skel" style={{ minHeight: 360, marginBottom: 22 }} />
      <div className="results">
        <div className="skel" />
        <div className="skel" />
      </div>
    </div>
  );
}
