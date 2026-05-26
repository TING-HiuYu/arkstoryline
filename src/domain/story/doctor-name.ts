const DOCTOR_NICKNAME_TOKEN = '{@nickname}'

export function applyDoctorName(content: string, doctorName?: string | null): string {
  const trimmedDoctorName = doctorName?.trim()

  if (!trimmedDoctorName) {
    return content
  }

  return content.replaceAll(DOCTOR_NICKNAME_TOKEN, trimmedDoctorName)
}
