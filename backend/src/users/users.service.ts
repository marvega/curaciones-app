import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserPreferences, DEFAULT_PREFERENCES } from './user.entity';
import { CreateUserDto } from './create-user.dto';
import { UpdatePreferencesDto } from './update-preferences.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async findById(id: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  /**
   * Returns the same projection `findAll` exposes for a user — never the saved
   * entity.
   *
   * `User.passwordHash` is a plain `@Column()` with no `select: false`, and
   * `main.ts` registers no ClassSerializerInterceptor, so returning what
   * `repo.save()` resolves to put the bcrypt hash in two places at once: the
   * HTTP response body, and `audit_logs.afterJson` — this route is
   * authenticated, only `/api/users/seed` is in the interceptor's SKIP_PATHS,
   * so every account creation was audited. That table is hash-chained, so a
   * hash written there cannot be scrubbed afterwards without invalidating the
   * chain (`npm run audit:verify`).
   *
   * The return type is pinned to the entity via `Pick`, so renaming a column
   * breaks the build here instead of silently widening the response.
   */
  async create(
    dto: CreateUserDto,
    createdBy?: { id: number; role: string },
  ): Promise<Pick<User, 'id' | 'username' | 'createdAt'>> {
    if (createdBy && createdBy.role !== 'admin') {
      throw new ConflictException('Solo los administradores pueden crear usuarios');
    }

    const existing = await this.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException(`El usuario ${dto.username} ya existe`);
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      username: dto.username,
      passwordHash: hash,
    });
    const saved = await this.userRepo.save(user);
    return {
      id: saved.id,
      username: saved.username,
      createdAt: saved.createdAt,
    };
  }

  async findAll() {
    return this.userRepo.find({
      order: { username: 'ASC' },
      select: ['id', 'username', 'createdAt'],
    });
  }

  async getPreferences(userId: number): Promise<UserPreferences> {
    const user = await this.findById(userId);
    return { ...DEFAULT_PREFERENCES, ...user.preferences };
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto): Promise<UserPreferences> {
    const user = await this.findById(userId);
    user.preferences = { ...DEFAULT_PREFERENCES, ...user.preferences, ...dto };
    await this.userRepo.save(user);
    return user.preferences as UserPreferences;
  }

  async seed() {
    // TODO(phase-13.1b): seed should also create default Organization +
    // OrganizationMembership for admin users. For now this just inserts the
    // bare User rows so tsc compiles; org membership wiring is out of scope.
    const users = [
      { username: 'admin', password: '***REMOVED-CREDENTIAL***' },
      { username: 'cynthia', password: '***REMOVED-CREDENTIAL***' },
    ];

    const created: User[] = [];
    for (const u of users) {
      const existing = await this.findByUsername(u.username);
      if (!existing) {
        const hash = await bcrypt.hash(u.password, 10);
        const user = this.userRepo.create({
          username: u.username,
          passwordHash: hash,
        });
        const saved = await this.userRepo.save(user);
        created.push(saved);
      }
    }
    return { created: created.length };
  }
}
