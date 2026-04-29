import * as React from 'react';
import { Html, Body, Container, Section, Text, Hr, Img } from '@react-email/components';

export const BRAND_NAME = process.env.EMAIL_BRAND_NAME || 'Curaciones';
export const BRAND_URL = process.env.EMAIL_BRAND_URL || 'https://curaciones.placeholder';

export function EmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Body style={{ backgroundColor: '#f5f7f8', fontFamily: 'Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: 560, margin: '0 auto', borderRadius: 8, padding: 32 }}>
          <Section>
            <Text style={{ fontSize: 18, fontWeight: 700, color: '#00897B', margin: 0 }}>
              {BRAND_NAME}
            </Text>
          </Section>
          <Hr style={{ borderColor: '#cfd8dc', margin: '16px 0' }} />
          {children}
          <Hr style={{ borderColor: '#cfd8dc', margin: '24px 0 12px' }} />
          <Text style={{ fontSize: 12, color: '#90a4ae', margin: 0 }}>
            Este correo fue enviado por {BRAND_NAME}. Si no esperabas este mensaje, puedes ignorarlo.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
