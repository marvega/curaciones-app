import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Patient } from './patients/patient.entity';
import { Curacion } from './curaciones/curacion.entity';
import { MonthlyCycle } from './cycles/cycle.entity';
import { User } from './users/user.entity';
import { Appointment } from './appointments/appointment.entity';
import { PatientStatusChange } from './patients/patient-status-change.entity';
import { CuracionEdit } from './curaciones/curacion-edit.entity';
import { AuditLog } from './audit-log/audit-log.entity';
import { WoundPhoto } from './wound-photos/wound-photo.entity';
import { WoundNote } from './wound-notes/wound-note.entity';
import { ConsentSignature } from './consent/consent-signature.entity';
import { Establishment } from './establishments/establishment.entity';
import { Product } from './inventory/products/product.entity';
import { ProductCode } from './inventory/products/product-code.entity';
import { Lot } from './inventory/lots/lot.entity';
import { LotMovement } from './inventory/movements/lot-movement.entity';
import { StockCount } from './inventory/stock-counts/stock-count.entity';
import { CanastaCategory } from './inventory/canasta/canasta-category.entity';
import { CanastaCategoryProduct } from './inventory/canasta/canasta-category-product.entity';
import { Organization } from './organizations/organization.entity';
import { OrganizationMembership } from './organizations/organization-membership.entity';
import { UserEstablishmentAssignment } from './establishments/user-establishment-assignment.entity';
import { RefreshToken } from './auth/refresh-token.entity';
import { Invitation } from './auth/invitation.entity';
import { PasswordResetToken } from './auth/password-reset-token.entity';
import { OAuthClient } from './oauth/entities/oauth-client.entity';
import { OAuthGrant } from './oauth/entities/oauth-grant.entity';
import { OAuthToken } from './oauth/entities/oauth-token.entity';
import { OAuthSigningKey } from './oauth/entities/oauth-signing-key.entity';
import { OAuthRevocation } from './oauth/entities/oauth-revocation.entity';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Patient, Curacion, MonthlyCycle, User, Appointment, PatientStatusChange,
    CuracionEdit, AuditLog, WoundPhoto, WoundNote, ConsentSignature,
    Establishment, Product, ProductCode, Lot, LotMovement, StockCount,
    CanastaCategory, CanastaCategoryProduct,
    Organization, OrganizationMembership, UserEstablishmentAssignment,
    RefreshToken, Invitation, PasswordResetToken,
    OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
