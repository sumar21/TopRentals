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
  <div className="flex flex-col gap-4 w-full">
    <div className="hidden md:block">
      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
      <p className="text-sm text-muted-foreground mt-1">Maestros de artículos y usuarios.</p>
    </div>

    <Tabs defaultValue="articulos">
      <TabsList>
        <TabsTrigger value="articulos">Artículos</TabsTrigger>
        <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
      </TabsList>
      <TabsContent value="articulos"><ArticulosPanel /></TabsContent>
      <TabsContent value="usuarios"><UsuariosPanel /></TabsContent>
    </Tabs>
  </div>
);

export default ConfiguracionView;
