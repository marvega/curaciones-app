import * as React from 'react';
import { Text, Button, Section } from '@react-email/components';
import { EmailLayout, BRAND_URL } from './EmailLayout';

interface Props {
  inviteeEmail: string;
  organizationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function InvitationEmail(props: Props) {
  return (
    <EmailLayout>
      <Section>
        <Text style={{ fontSize: 16 }}>Hola,</Text>
        <Text>
          {props.inviterName} te invitó a unirte a <strong>{props.organizationName}</strong> como{' '}
          <strong>{props.role}</strong>.
        </Text>
        <Text>Hacé clic en el botón para aceptar la invitación y crear tu cuenta:</Text>
        <Button
          href={props.acceptUrl}
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
          Aceptar invitación
        </Button>
        <Text style={{ fontSize: 12, color: '#616161' }}>
          Este link expira en {props.expiresInDays} días. Si no querés unirte, ignorá este mensaje.
        </Text>
        <Text style={{ fontSize: 12, color: '#616161' }}>
          Sitio: {BRAND_URL}
        </Text>
      </Section>
    </EmailLayout>
  );
}
