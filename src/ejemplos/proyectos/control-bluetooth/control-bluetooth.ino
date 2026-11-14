// Control por Bluetooth: maneja el robot desde el teléfono. En el simulador, el teléfono es la
// pestaña Bluetooth de "Mensajes del robot": presiona «Conectar teléfono» y usa las flechas
// (envían F, B, L, R y S) o escribe esas letras. En el robot real sirve cualquier app de
// "terminal Bluetooth" o "control RC" que envíe letras.
#include "BluetoothSerial.h"
#include "pines.h"

BluetoothSerial SerialBT;
int velocidad = 150;  // de 0 a 255

// Mueve los motores: valores de -255 (atrás) a 255 (adelante).
void motores(int izq, int der) {
  digitalWrite(PIN_IN1_IZQ, izq >= 0);
  digitalWrite(PIN_IN2_IZQ, izq < 0);
  digitalWrite(PIN_IN1_DER, der >= 0);
  digitalWrite(PIN_IN2_DER, der < 0);
  ledcWrite(PIN_PWM_IZQ, constrain(abs(izq), 0, 255));
  ledcWrite(PIN_PWM_DER, constrain(abs(der), 0, 255));
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_IN1_IZQ, OUTPUT);
  pinMode(PIN_IN2_IZQ, OUTPUT);
  pinMode(PIN_IN1_DER, OUTPUT);
  pinMode(PIN_IN2_DER, OUTPUT);
  ledcAttach(PIN_PWM_IZQ, 5000, 8);
  ledcAttach(PIN_PWM_DER, 5000, 8);

  SerialBT.begin("RobotDynamis");  // el nombre que verá el teléfono
  Serial.println("Bluetooth encendido: conéctate a RobotDynamis");
}

void loop() {
  if (SerialBT.available()) {
    char letra = SerialBT.read();
    switch (letra) {
      case 'F': motores(velocidad, velocidad);   SerialBT.println("Adelante"); break;
      case 'B': motores(-velocidad, -velocidad); SerialBT.println("Atrás"); break;
      case 'L': motores(-velocidad, velocidad);  SerialBT.println("Izquierda"); break;
      case 'R': motores(velocidad, -velocidad);  SerialBT.println("Derecha"); break;
      case 'S': motores(0, 0);                   SerialBT.println("Detenido"); break;
      case '+': velocidad = min(velocidad + 25, 255); SerialBT.printf("Velocidad %d\n", velocidad); break;
      case '-': velocidad = max(velocidad - 25, 50);  SerialBT.printf("Velocidad %d\n", velocidad); break;
      case '\n': case '\r': break;  // el final de línea no es una orden
      default: SerialBT.printf("No conozco «%c»: usa F, B, L, R, S, + o -\n", letra);
    }
  }
  delay(10);
}
