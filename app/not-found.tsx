import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0d1013",
      color: "#e8eaed",
      padding: "24px",
      textAlign: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      <div style={{ fontSize: "72px", fontWeight: "800", background: "linear-gradient(135deg, #ff6b35, #f7c531)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "8px" }}>404</div>
      <h1 style={{ fontSize: "24px", fontWeight: "600", margin: "0 0 8px 0" }}>หน้าไม่พบ</h1>
      <p style={{ fontSize: "14px", color: "#9aa0a6", margin: "0 0 24px 0", maxWidth: "320px" }}>หน้าที่คุณกำลังมองหาอาจถูกลบ ย้าย หรือไม่มีอยู่จริง</p>
      <Link href="/" style={{
        display: "inline-block",
        padding: "12px 28px",
        background: "linear-gradient(135deg, #ff6b35, #f7c531)",
        color: "#0d1013",
        textDecoration: "none",
        borderRadius: "24px",
        fontWeight: "600",
        fontSize: "14px",
        transition: "transform 0.2s"
      }}>กลับสู่หน้าหลัก</Link>
    </div>
  );
}
