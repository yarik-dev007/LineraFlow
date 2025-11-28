import React, { useEffect, useRef } from 'react';

interface ParallelPulseProps {
  isInteracting: boolean;
}

const ParallelPulse: React.FC<ParallelPulseProps> = ({ isInteracting }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let time = 0;

    // Configuration
    const stringCount = 16;
    const baseSpacing = width / (stringCount + 4); // Spread them out specifically on the right side usually, but here we cover bg
    const color = '#FF4438';
    
    // Mouse state
    let mouseX = 0;
    let mouseY = 0;

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    handleResize();

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.02;

      // Draw the grid background pattern manually if needed, or let CSS handle it. 
      // We focus on the strings here.
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      // Calculate the right-side bias for the Hero Element placement
      // The prompt says "Right of the title", so we position these strings mainly on the right half
      const startX = width * 0.4; 
      const areaWidth = width * 0.6;
      const spacing = areaWidth / stringCount;

      for (let i = 0; i < stringCount; i++) {
        const baseX = startX + (i * spacing);
        
        ctx.beginPath();
        
        // Create the string path
        // We use multiple segments to create the curve effect
        const segments = 30;
        const segmentHeight = height / segments;

        for (let j = 0; j <= segments; j++) {
          const y = j * segmentHeight;
          
          // Physics/Math for the "Pulse" and "Wave"
          // Distance from mouse affects the x-offset (repulsion)
          const dx = baseX - mouseX;
          const dy = y - mouseY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 300;
          
          let offsetX = 0;
          
          // Mouse interaction (repulsion/plucking)
          if (distance < maxDist) {
            const force = (1 - distance / maxDist) * 40; // strength
            // Direction of force
            const dirX = dx / distance;
            offsetX = dirX * force;
          }

          // Idle Pulse Animation
          // A sine wave traveling vertically
          const pulse = Math.sin(y * 0.01 - time * 2 + i) * 5;
          
          // High-speed data pulse (white flash logic could go here, but we simulate via width/opacity)
          
          // Combine
          const finalX = baseX + offsetX + pulse;

          if (j === 0) {
            ctx.moveTo(finalX, y);
          } else {
            ctx.lineTo(finalX, y);
          }
        }

        // Dynamic styling based on interaction or pulse position
        const pulsePos = (time * 100) % (height + 200) - 100;
        
        ctx.stroke();

        // Draw the "Packet" (Pulse light)
        if (isInteracting || (Math.random() > 0.98)) {
           // Random glitches or active pulse
        }
        
        // Draw a glowing bead moving down the string
        const beadY = (time * (200 + i * 10)) % height;
        ctx.fillStyle = isInteracting ? '#FFFFFF' : '#FF4438';
        ctx.beginPath();
        ctx.arc(baseX + Math.sin(beadY * 0.01 - time * 2 + i) * 5, beadY, isInteracting ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isInteracting]);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
    />
  );
};

export default ParallelPulse;