import * as React from 'react';
import { Html, Body, Head, Heading, Hr, Container, Preview, Section, Text, Button } from '@react-email/components';

interface InviteEmailProps {
  role: string;
  campusName: string;
  actionUrl: string;
}

export const InviteEmail = ({ role, campusName, actionUrl }: InviteEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>You have been invited to join {campusName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Join {campusName}</Heading>
          <Text style={text}>
            You have received an exclusive invitation to join the {campusName} portal as a <strong>{role}</strong>.
          </Text>
          <Text style={text}>
            Click the button below to accept your invitation, set up your profile, and access your protected dashboard.
          </Text>
          <Section style={btnContainer}>
            <Button style={button} href={actionUrl}>
              Accept Invitation
            </Button>
          </Section>
          <Text style={text}>
            Note: This activation link will expire in 48 hours.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            SkooleeAI Campus Management System
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  borderRadius: '8px',
  border: '1px solid #eaeaea',
  maxWidth: '480px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: '700',
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const text = {
  color: '#525f7f',
  fontSize: '15px',
  lineHeight: '24px',
  textAlign: 'left' as const,
};

const btnContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
  marginBottom: '32px',
};

const button = {
  backgroundColor: '#10b981', // Emerald for invites
  borderRadius: '6px',
  color: '#fff',
  fontSize: '15px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
  fontWeight: '600',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  textAlign: 'center' as const,
};
