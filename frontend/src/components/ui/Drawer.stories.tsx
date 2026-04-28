import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button } from './Button';
import { Drawer } from './Drawer';

const meta: Meta<typeof Drawer> = { title: 'UI/Drawer', component: Drawer, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Drawer>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Abrir drawer</Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Apósitos bacteriostáticos"
          subtitle="Editar productos asociados"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setOpen(false)}>Guardar</Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">Aquí va el cuerpo del drawer.</p>
        </Drawer>
      </>
    );
  },
};
