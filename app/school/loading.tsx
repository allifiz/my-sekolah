export default function SchoolLoading() {
  return (
    <div className="loading-shell" aria-label="Memuat halaman sekolah" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton-grid">
        {Array.from({ length: 8 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}
      </div>
    </div>
  );
}
