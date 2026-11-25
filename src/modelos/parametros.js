// Constantes físicas que usan los modelos y que no son parte de "Mi robot".
// Son estimaciones razonables para el Dynamis (ESP32, TB6612 y dos GA25-370 con ruedas de 60 mm);
// TODO(profe): reemplazarlas por valores medidos. La velocidad máxima de las ruedas está en la
// configuración del robot (motores.vMaxMmS).
export const PARAMETROS = {
  /** Masa del robot completo, con baterías (kg). */
  masa: 0.75,
  /** Fracción del peso sobre las ruedas motrices; el resto va en las ruedas locas o en el chasis. */
  pesoEnMotrices: 0.65,
  /** Fuerza de cada rueda motriz con el motor detenido y duty = 1 (N): el torque de arranque / el radio. */
  fuerzaArranque: 4.5,
  /** Masa equivalente del rotor y la caja reductora de cada motor, vista en la rueda (kg). */
  inerciaRueda: 0.04,
  /** Roce de la caja reductora, en la rueda (N). */
  roceCaja: 0.3,
  /** Fricción entre goma y suelo: estática (agarre) y dinámica (patinando). */
  friccionEstatica: 0.85,
  friccionDinamica: 0.65,
  /** Resistencia a la rodadura (fracción del peso). */
  rodadura: 0.02,
  /** Roce de las ruedas locas al girar el robot sobre su eje (N·m por N de peso sobre ellas). */
  roceGiro: 0.004,
  /** Qué tan fuerte frena el motor en corto (freno): 1 = tanto como su fuerza contraelectromotriz. */
  frenoCorto: 1,
  /** Diferencia entre los dos motores: cada uno sale entre ±esto de lo nominal (fracción). */
  diferenciaMotores: 0.03,
  /** Gravedad (m/s²). */
  gravedad: 9.81,
};
