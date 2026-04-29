import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import {
  EncryptedField,
  encryptedColumnTransformer,
} from '../kms/encrypted-column.transformer';

export interface UserPreferences {
  inactivityThresholdDays: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  inactivityThresholdDays: 14,
};

@Entity('users')
@Unique('UQ_users_username', ['username'])
@Unique('UQ_users_email_hash', ['emailHash'])
@Index('IDX_users_email_hash', ['emailHash'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('User.email'),
  })
  email: EncryptedField | null;

  @Column({ type: 'char', length: 64, nullable: true })
  emailHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences | null;

  @CreateDateColumn()
  createdAt: Date;
}
