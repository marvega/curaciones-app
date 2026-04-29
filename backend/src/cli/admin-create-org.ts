/**
 * Usage: npm run admin:create-org -- \
 *   --name "CESFAM Lo Espejo" \
 *   --owner-email "director@cesfamloespejo.cl" \
 *   --owner-name "Dra. Patricia Soto" \
 *   --tier pilot \
 *   --establishment "Sede principal"
 */
import 'reflect-metadata';
import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { Organization, OrganizationTier, OrganizationStatus } from '../organizations/organization.entity';
import { Establishment } from '../establishments/establishment.entity';
import { InvitationsService } from '../auth/invitations.service';
import { OrgRole } from '../organizations/organization-membership.entity';
import { runWithBypass } from '../common/org-context';
import { User } from '../users/user.entity';

async function main() {
  const program = new Command();
  program
    .requiredOption('--name <name>')
    .requiredOption('--owner-email <email>')
    .requiredOption('--owner-name <name>')
    .option('--tier <tier>', 'free|pilot|paid', 'pilot')
    .option('--establishment <name>', 'Default establishment name', 'Sede principal')
    .option('--comuna <comuna>', 'Establishment comuna', 'Sin especificar');
  program.parse(process.argv);
  const opts = program.opts();

  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);
  const invitations = app.get(InvitationsService);

  await runWithBypass(async () => {
    const orgRepo = ds.getRepository(Organization);
    const estRepo = ds.getRepository(Establishment);
    const userRepo = ds.getRepository(User);

    const org = await orgRepo.save(orgRepo.create({
      name: opts.name,
      tier: opts.tier as OrganizationTier,
      status: OrganizationStatus.ACTIVE,
    }));

    await estRepo.save(estRepo.create({
      name: opts.establishment,
      comuna: opts.comuna,
      organizationId: org.id,
    }));

    // System inviter: pick first existing admin user, else fallback to user id 1.
    const inviter = await userRepo.find({ order: { id: 'ASC' }, take: 1 });
    const inviterId = inviter[0]?.id ?? 1;

    const { token } = await invitations.create(
      org.id,
      inviterId,
      'Sistema',
      opts.ownerEmail,
      OrgRole.OWNER,
    );

    console.log(`[admin:create-org] org=${org.id} name="${org.name}"`);
    console.log(`[admin:create-org] invitation token: ${token}`);
    console.log(`[admin:create-org] invitation email sent to ${opts.ownerEmail}`);
  });

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
