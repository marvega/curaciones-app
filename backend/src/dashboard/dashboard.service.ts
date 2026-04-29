import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { KMS_SERVICE } from '../kms/kms.service';
import type { KmsService } from '../kms/kms.service';
import { getCurrentOrgId } from '../common/org-context';
import { decryptPatientPii } from '../patients/patient-projection.util';
import { EncryptedField } from '../kms/encrypted-field';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Curacion)
    private readonly curacionRepo: Repository<Curacion>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    private readonly appointmentsService: AppointmentsService,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    return orgId;
  }

  async getTodayAppointments() {
    const today = new Date().toISOString().split('T')[0];
    return this.appointmentsService.getAgenda(today, today);
  }

  async getPatientsWithoutAppointment() {
    const today = new Date().toISOString().split('T')[0];
    const orgId = this.requireOrgId();

    // Active patients with no future appointments
    const patients = await this.patientRepo
      .createQueryBuilder('p')
      .leftJoin('p.appointments', 'a', 'a.date >= :today', { today })
      .where('p.status = :status', { status: 'active' })
      .andWhere('a.id IS NULL')
      .orderBy('p.lastName', 'ASC')
      .limit(50)
      .getMany();

    // For each patient, get their last curacion
    const result = await Promise.all(
      patients.map(async (p) => {
        const [lastCuracion, { rut }] = await Promise.all([
          this.curacionRepo.findOne({
            where: { patientId: p.id },
            order: { date: 'DESC' },
          }),
          decryptPatientPii(p, this.kms, orgId),
        ]);

        const daysSince = lastCuracion
          ? Math.floor(
              (Date.now() - new Date(lastCuracion.date).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

        return {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          rut,
          lastCuracion: lastCuracion
            ? { date: lastCuracion.date, type: lastCuracion.type }
            : null,
          daysSinceLastCuracion: daysSince,
        };
      }),
    );

    return result;
  }

  async getInactivePatients(days: number) {
    const orgId = this.requireOrgId();
    // Use raw query for the HAVING clause with date arithmetic
    const results = await this.patientRepo
      .createQueryBuilder('p')
      .leftJoin('p.curaciones', 'c')
      .select([
        'p.id AS id',
        'p."firstName" AS "firstName"',
        'p."lastName" AS "lastName"',
        'p.rut AS rut',
        'MAX(c.date) AS "lastCuracionDate"',
      ])
      .where('p.status = :status', { status: 'active' })
      .groupBy('p.id')
      .having('MAX(c.date) < :cutoff OR MAX(c.date) IS NULL', {
        cutoff: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
      })
      .orderBy('MAX(c.date)', 'ASC', 'NULLS FIRST')
      .getRawMany();

    // Get the curacion type for each patient's last curacion
    const enriched = await Promise.all(
      results.map(async (r) => {
        // Normalize date — raw query may return ISO timestamp
        const rawDate = r.lastCuracionDate
          ? new Date(r.lastCuracionDate).toISOString().split('T')[0]
          : null;

        const [lastCuracionType, { rut }] = await Promise.all([
          rawDate
            ? this.curacionRepo
                .findOne({ where: { patientId: r.id, date: rawDate } })
                .then((c) => c?.type ?? null)
            : Promise.resolve(null),
          decryptPatientPii(
            { id: r.id, rut: r.rut as EncryptedField },
            this.kms,
            orgId,
          ),
        ]);

        const daysSince = rawDate
          ? Math.floor(
              (Date.now() - new Date(rawDate).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

        return {
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          rut,
          lastCuracionDate: rawDate,
          lastCuracionType,
          daysSinceLastCuracion: daysSince,
        };
      }),
    );

    return enriched;
  }
}
