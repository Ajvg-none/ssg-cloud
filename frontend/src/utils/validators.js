export const validators = {
  isNumber: (value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseFloat(value));
  },
};

export const validateOpticalFields = (data) => {
  const errors = {};

  const numericFields = [
    'od_esfera', 'od_cilindro', 'od_eje', 'od_adicion',
    'od_dp_centro', 'od_dp_cerca', 'altura_od',
    'oi_esfera', 'oi_cilindro', 'oi_eje', 'oi_adicion',
    'oi_dp_centro', 'oi_dp_cerca', 'altura_oi',
    'montura_horizontal', 'montura_vertical', 'montura_puente', 'montura_diametro_max',
  ];

  numericFields.forEach((field) => {
    if (data[field] !== null && data[field] !== undefined && data[field] !== '' && !validators.isNumber(data[field])) {
      errors[field] = 'Debe ser un número válido';
    }
  });

  return errors;
};

// Para tipos RX / Transcripción se requiere elegir al menos un ojo afectado.
export const validateAffectedEyes = (warrantyType, affectedEyes) => {
  const isRXType = warrantyType === 'Error de Transcripcion' || warrantyType === 'Error de RX';
  if (isRXType && affectedEyes.length === 0) {
    return { affectedEyes: 'Selecciona al menos un ojo afectado' };
  }
  return {};
};
