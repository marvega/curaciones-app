import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

export interface UserPreferences {
  inactivityThresholdDays: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  inactivityThresholdDays: 14,
};

@Entity('users')
@Unique(['username'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  passwordHash: string;

  @Column({ default: 'user' })
  role: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences | null;

  @CreateDateColumn()
  createdAt: Date;
}
