import { useEffect, useState } from "react";
type Control = { id: string; min: number; max: number; value: number };
export function Remote() {
  const [controls, setControls] = useState<Control[]>([]);
  const [socket, setSocket] = useState<WebSocket>();
  const [status, setStatus] = useState("Conectando…");
  useEffect(() => {
    let stop = false;
    let ws: WebSocket;
    let retry: number;
    function connect() {
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/control?token=${encodeURIComponent(location.hash.slice(1))}`,
      );
      ws.onopen = () => setSocket(ws);
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "state") {
          setControls(data.controls);
          setStatus(
            data.connected ? "Conectado al estudio" : "Estudio desconectado",
          );
        }
      };
      ws.onclose = () => {
        setStatus("Reconectando…");
        if (!stop) retry = window.setTimeout(connect, 1500);
      };
    }
    connect();
    return () => {
      stop = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);
  return (
    <main className="remote-page">
      <div className="brand-word">zence / R2</div>
      <h1>Control remoto</h1>
      <p role="status">{status}</p>
      {controls.map((control) => (
        <label className="field" key={control.id}>
          {control.id} · {control.value.toFixed(2)}
          <input
            type="range"
            min={control.min}
            max={control.max}
            step="any"
            value={control.value}
            disabled={status !== "Conectado al estudio"}
            onChange={(e) => {
              const value = Number(e.target.value);
              setControls((items) =>
                items.map((item) =>
                  item.id === control.id ? { ...item, value } : item,
                ),
              );
              if (socket?.readyState === 1)
                socket.send(
                  JSON.stringify({ type: "set", id: control.id, value }),
                );
            }}
          />
        </label>
      ))}
    </main>
  );
}
