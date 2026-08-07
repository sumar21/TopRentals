// Configuración / ABM — maestros del back-office. See docs/analysis/desktop_Screen_Configuracion.md.
// La PA original solo dejaba "Articulos" alcanzable (el ComboBox de tipo estaba
// hardcodeado a esa única opción); "Usuarios" existía completo en Power Fx pero
// bloqueado en la UI. Decisión de producto para este rebuild: ambas pestañas quedan
// vivas. Tripulación/Activos no tenían ninguna lógica real detrás — se descartan.
import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/UIComponents';
import ArticulosPanel from './ArticulosPanel';
import UsuariosPanel from './UsuariosPanel';

const ConfiguracionView: React.FC = () => (
  <div className="flex flex-col gap-4 w-full md:h-full md:min-h-0">
    <div className="hidden md:block shrink-0">
      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
      <p className="text-sm text-muted-foreground mt-1">Maestros de artículos y usuarios.</p>
    </div>

    {/* Tabs fills the viewport so each panel's table scrolls internally (sticky header). */}
    <Tabs defaultValue="articulos" className="md:flex md:flex-col md:flex-1 md:min-h-0">
      <TabsList className="shrink-0 self-start">
        <TabsTrigger value="articulos">Artículos</TabsTrigger>
        <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
      </TabsList>
      <TabsContent value="articulos" className="md:flex md:flex-col md:flex-1 md:min-h-0"><ArticulosPanel /></TabsContent>
      <TabsContent value="usuarios" className="md:flex md:flex-col md:flex-1 md:min-h-0"><UsuariosPanel /></TabsContent>
    </Tabs>
  </div>
);

export default ConfiguracionView;
