import * as React from 'react';
import { Text, Section } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface Props {
  changedAt: Date;
  ipAddress?: string;
}

export function PasswordChangedEmail(props: Props) {
  return (
    <EmailLayout>
      <Section>
        <Text style={{ fontSize: 16, fontWeight: 600, color: '#c62828' }}>
          Tu contraseña fue actualizada
        </Text>
        <Text>
          Tu contraseña fue cambiada el {props.changedAt.toLocaleString('es-CL')}
          {props.ipAddress ? ` desde ${props.ipAddress}` : ''}.
        </Text>
        <Text>
          Si no fuiste vos, contactanos inmediatamente y restablecé tu contraseña.
        </Text>
      </Section>
    </EmailLayout>
  );
}
