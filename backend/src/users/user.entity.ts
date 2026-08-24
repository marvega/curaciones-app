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

  /**
   * `select: false` is a security control, not a performance tweak. Do not
   * remove it, and do not add `addSelect('...passwordHash')` outside
   * `AuthService.loadPasswordHash`.
   *
   * Eleven entities carry a `@ManyToOne(() => User)` relation (`recordedBy`,
   * `uploadedBy`, `witnessedBy`, `performedBy`, `editedBy`, `invitedBy`,
   * `user`). Any route that loads one of those relations — via
   * `relations: [...]`, `leftJoinAndSelect`, or `innerJoinAndSelect` — used to
   * hydrate the full `User`, bcrypt hash included, straight into the HTTP
   * response body. `main.ts` registers no `ClassSerializerInterceptor`, so
   * `@Exclude()` would have been inert; a per-route projection would have
   * closed only the relations that leak today and left the next one to leak
   * again. Making the column unselectable closes the class of bug at the one
   * place the column is defined: TypeORM omits it from every find, relation
   * load, and query-builder select unless a caller explicitly asks for it.
   *
   * Writes are unaffected — `repo.create({ passwordHash })` or
   * `user.passwordHash = ...` followed by `save()` still persists, because
   * TypeORM's diff only skips properties that are `undefined`.
   *
   * Reads have exactly one authorised caller: `AuthService.loadPasswordHash`,
   * which pulls the column as a raw scalar (never as a `User` instance) for
   * `bcrypt.compare` in login and change-password.
   *
   * Guarded by `test/password-hash-never-serialized.e2e-spec.ts`, which derives
   * its coverage from `DataSource.entityMetadatas` so a new
   * `@ManyToOne(() => User)` relation is covered the moment it is declared.
   */
  @Column({ select: false })
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
