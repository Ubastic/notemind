import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
});

export default function MermaidDiagram({ chart }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!chart) return;
    
    const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
    
    mermaid.render(id, chart)
      .then(({ svg }) => {
        setSvg(svg);
        setError("");
      })
      .catch((err) => {
        console.error("Mermaid render error:", err);
        setError("Failed to render diagram");
        // Mermaid sometimes leaves the error element in the DOM, we might want to clean it up or just let it be.
      });
  }, [chart]);

  if (error) {
    return <div className="mermaid-error text-error">{error}</div>;
  }

  return (
    <div 
      ref={containerRef}
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}
