"use client";

interface WinnerNotificationProps {
  contest: any;
  onClose: () => void;
  visible: boolean;
}

export default function WinnerNotificationPopup({ contest, onClose, visible }: WinnerNotificationProps) {
  // Get all prizes (prize_1 to prize_5)
  const prizes = [
    contest.prize_1,
    contest.prize_2,
    contest.prize_3,
    contest.prize_4,
    contest.prize_5,
  ].filter(Boolean);

  return (
    <div style={{ 
      position: "fixed", 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      background: "rgba(0,0,0,0.7)", 
      display: visible ? "flex" : "none",
      alignItems: "center", 
      justifyContent: "center", 
      zIndex: 10000,
      animation: visible ? "fadeIn 0.2s ease-out" : "none"
    }}>
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--yellow)",
        borderRadius: "12px",
        padding: "24px",
        maxWidth: "450px",
        textAlign: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
      }}>
        <div style={{ fontSize: "48px", marginBottom: "12px" }}>🏆</div>
        <h3 style={{ color: "var(--yellow)", marginBottom: "8px" }}>คุณได้รับรางวัลแล้ว!</h3>
        <p style={{ color: "var(--text)", marginBottom: "12px" }}>
          คุณได้รับรางวัลจากกิจกรรม "{contest.name}"
        </p>
        
        {/* Show all prizes */}
        {prizes.length > 0 && (
          <div style={{ 
            background: "rgba(255, 225, 0, 0.05)",
            border: "1px solid rgba(255, 225, 0, 0.2)",
            borderRadius: "8px",
            padding: "12px",
            textAlign: "left",
            marginBottom: "12px"
          }}>
            <div style={{ color: "var(--yellow)", fontWeight: "bold", marginBottom: "8px" }}>
              🎁 รางวัลที่ได้รับ ({prizes.length} รายการ):
            </div>
            {prizes.map((prize: string, idx: number) => (
              <div key={idx} style={{ 
                color: "var(--text)", 
                padding: "4px 0",
                lineHeight: 1.4
              }}>
                • {prize}
              </div>
            ))}
          </div>
        )}

        {/* Shipping Address Status */}
        {contest.winner?.shipping_address ? (
          <div style={{ 
            padding: "12px", 
            background: "rgba(76, 175, 80, 0.1)", 
            borderRadius: "8px", 
            marginBottom: "12px",
            textAlign: "left",
            fontSize: "11px",
            color: "var(--text)"
          }}>
            ✅ ที่อยู่สำหรับจัดส่ง:
            <div style={{ marginTop: "6px", color: "var(--text-strong)" }}>
              {contest.winner.shipping_name}<br />
              {contest.winner.shipping_address}<br />
              {contest.winner.shipping_zipcode}<br />
              {contest.winner.shipping_phone}
            </div>
          </div>
        ) : (
          <div style={{ 
            padding: "12px", 
            background: "rgba(255, 77, 79, 0.1)", 
            borderRadius: "8px", 
            marginBottom: "12px",
            color: "var(--red)"
          }}>
            ⚠️ โปรดกรอกที่อยู่เพื่อรับรางวัล!
          </div>
        )}
        
        <a 
          href="/profile" 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={onClose}
          style={{ 
            display: "inline-block", 
            padding: "10px 20px", 
            background: "var(--yellow)", 
            color: "#000", 
            textDecoration: "none",
            fontWeight: "bold",
            borderRadius: "8px",
            marginBottom: "8px"
          }}
        >
          📍 ไปกรอกที่อยู่
        </a>
        <button 
          onClick={onClose}
          style={{ 
            padding: "8px 16px", 
            background: "transparent", 
            border: "1px solid var(--hairline)", 
            borderRadius: "8px",
            cursor: "pointer"
          }}
        >
          ปิด
        </button>
      </div>
    </div>
  );
}
