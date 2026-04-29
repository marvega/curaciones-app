import * as React from 'react';
import { Text, Button, Section } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface Props {
  resetUrl: string;
  expiresInMinutes: number;
}

export function PasswordResetEmail(props: Props) {
  return (
    <EmailLayout>
      <Section>
        <Text style={{ fontSize: 16, fontWeight: 600 }}>Restablecer contraseña</Text>
        <Text>Recibimos una solicitud para restablecer tu contraseña.</Text>
        <Button
          href={props.resetUrl}
          style={{
            backgroundColor: '#00897B',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
            display: 'inline-block',
            margin: '16px 0',
          }}
        >
          Crear nueva contraseña
        </Button>
        <Text style={{ fontSize: 12, color: '#616161' }}>
          El link expira en {props.expiresInMinutes} minutos. Si no solicitaste esto, ignorá este mensaje.
        </Text>
      </Section>
    </EmailLayout>
  );
}
