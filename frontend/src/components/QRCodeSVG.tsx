import React from 'react';

interface QRCodeSVGProps {
  value: string;
  size?: number; // width/height in px
}

export default function QRCodeSVG({ value, size = 180 }: QRCodeSVGProps) {
  // Let's create a 21x21 QR-like grid (Version 1 QR code size)
  const gridSize = 21;
  const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));

  // Helper to draw a square on the grid
  const drawSquare = (x: number, y: number, s: number, fill: boolean = true) => {
    for (let i = 0; i < s; i++) {
      for (let j = 0; j < s; j++) {
        if (x + i < gridSize && y + j < gridSize) {
          grid[x + i][y + j] = fill;
        }
      }
    }
  };

  // Helper to draw a finder pattern (7x7 outline)
  const drawFinderPattern = (x: number, y: number) => {
    // Outer 7x7 black
    drawSquare(x, y, 7, true);
    // Inner 5x5 white
    drawSquare(x + 1, y + 1, 5, false);
    // Center 3x3 black
    drawSquare(x + 2, y + 2, 3, true);
  };

  // Draw 3 finder patterns
  drawFinderPattern(0, 0); // Top-left
  drawFinderPattern(gridSize - 7, 0); // Top-right
  drawFinderPattern(0, gridSize - 7); // Bottom-left

  // Draw alignment pattern (5x5) at bottom-right
  const ax = 12, ay = 12;
  drawSquare(ax, ay, 5, true);
  drawSquare(ax + 1, ay + 1, 3, false);
  drawSquare(ax + 2, ay + 2, 1, true);

  // Deterministic hash of value to fill the rest of the cells
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Populate grid pseudorandomly based on hash
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      // Skip finder patterns
      const isTopLeft = r < 8 && c < 8;
      const isTopRight = r < 8 && c >= gridSize - 8;
      const isBottomLeft = r >= gridSize - 8 && c < 8;
      // Skip alignment pattern
      const isAlignment = r >= ax && r < ax + 5 && c >= ay && c < ay + 5;

      if (!isTopLeft && !isTopRight && !isBottomLeft && !isAlignment) {
        // Use hash to decide cell state
        const val = Math.abs(Math.sin(hash + r * 13 + c * 37));
        grid[r][c] = val > 0.45;
      }
    }
  }

  // Render SVG elements
  const cellSize = 10;
  const svgSize = gridSize * cellSize;
  
  const rects: React.JSX.Element[] = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c]) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize}
            height={cellSize}
            fill="#0f172a" // slate-900 color for dark pixels
          />
        );
      }
    }
  }

  return (
    <div className="flex justify-center items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-inner">
      <svg
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        style={{ width: `${size}px`, height: `${size}px` }}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <rect width={svgSize} height={svgSize} fill="#ffffff" />
        {rects}
      </svg>
    </div>
  );
}
