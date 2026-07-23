// Technician module shell — mobile-first: phone-width column centered on larger
// screens. Views own their headers/back buttons (mirrors the Power Apps mobile app).
import { Outlet } from 'react-router-dom';
import { TooltipHost } from './ui/Tooltip';

const LayoutTecnico = () => (
  <div className="min-h-dvh bg-secondary/30">
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-sm md:border-x">
      <Outlet />
    </div>
    <TooltipHost />
  </div>
);

export default LayoutTecnico;
