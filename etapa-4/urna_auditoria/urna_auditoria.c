#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "hardware/uart.h"
#include "hardware/irq.h"

// Includes da biblioteca do SD Card
#include "sd_card.h"
#include "ff.h"

// CONFIGURAÇÕES DE HARDWARE
// UART para comunicação com a Urna (MCU 1)
#define UART_ID uart0
#define UART_TX_PIN 0
#define UART_RX_PIN 1
#define BAUD_RATE 115200

// LED de status (LED integrado na placa Pico)
#define LED_PIN 25

// VARIÁVEIS GLOBAIS
char uart_buffer[256];
volatile int buffer_pos = 0; // 'volatile' pois é modificado na interrupção
volatile bool new_message_received = false; // Flag para sinalizar que uma nova mensagem chegou

// FUNÇÕES

/**
 * @brief Callback da Interrupção - executado quando a UART recebe dados.
 * Lê os caracteres, monta a mensagem no buffer e sinaliza
 * o loop principal quando uma mensagem completa é recebida.
 */
void on_uart_rx() {
    while (uart_is_readable(UART_ID)) {
        char ch = uart_getc(UART_ID);

        // Se recebemos uma nova linha ou o buffer está cheio, a mensagem está completa
        if (ch == '\n' || buffer_pos >= (sizeof(uart_buffer) - 1)) {
            if (buffer_pos > 0) { // Garante que não processemos mensagens vazias
                uart_buffer[buffer_pos] = '\n'; // Garante o caractere de nova linha
                uart_buffer[buffer_pos + 1] = '\0'; // Adiciona o terminador nulo
                new_message_received = true; // Sinaliza para o loop principal
            }
            buffer_pos = 0; // Reseta para a próxima mensagem
        } else if (ch >= ' ' && ch <= '~') { // Aceita apenas caracteres imprimíveis
            uart_buffer[buffer_pos++] = ch;
        }
    }
}

/**
 * @brief Grava uma string de dados no arquivo de log "auditoria.txt" no cartão SD.
 * * @param data A string de dados a ser gravada.
 */
void log_to_sd_card(const char* data) {
    printf("Gravando no SD Card: %s", data);
    
    FRESULT fr;
    FATFS fs;
    FIL fil;

    // Monta o drive do SD Card
    fr = f_mount(&fs, "0:", 1);
    if (fr != FR_OK) {
        printf("ERRO: Nao foi possivel montar o filesystem (%d)\n", fr);
        return;
    }

    // Abre o arquivo para ADICIONAR ao final (append)
    fr = f_open(&fil, "auditoria.txt", FA_WRITE | FA_OPEN_APPEND | FA_CREATE_ALWAYS);
    if (fr != FR_OK) {
        printf("ERRO: Nao foi possivel abrir o arquivo 'auditoria.txt' (%d)\n", fr);
        f_unmount("0:");
        return;
    }

    // Escreve os dados no arquivo
    if (f_printf(&fil, "%s", data) < 0) {
        printf("ERRO: Nao foi possivel escrever no arquivo.\n");
    } else {
        printf("Gravado com sucesso!\n");
        gpio_put(LED_PIN, 1); // Pisca o LED para indicar sucesso
        sleep_ms(100);
        gpio_put(LED_PIN, 0);
    }

    // Fecha o arquivo (essencial para salvar os dados!)
    fr = f_close(&fil);
    if (fr != FR_OK) {
        printf("ERRO: Nao foi possivel fechar o arquivo (%d)\n", fr);
    }
    
    // Desmonta o drive
    f_unmount("0:");
}

int main() {
    stdio_init_all();
    sleep_ms(2000); // Aguarda o monitor serial conectar

    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);
    
    // Inicializa a UART e suas interrupções
    uart_init(UART_ID, BAUD_RATE);
    gpio_set_function(UART_TX_PIN, GPIO_FUNC_UART);
    gpio_set_function(UART_RX_PIN, GPIO_FUNC_UART);
    irq_set_exclusive_handler(UART0_IRQ, on_uart_rx);
    irq_set_enabled(UART0_IRQ, true);
    uart_set_irq_enables(UART_ID, true, false); // Habilita interrupção apenas para RX
    
    printf("Firmware do Logger (MCU 2) iniciado.\n");
    printf("Inicializando SD Card...\n");
    
    if (!sd_init_driver()) {
        printf("ERRO FATAL: Nao foi possivel inicializar o driver do SD Card.\n");
        // Pisca o LED rapidamente para indicar erro fatal de hardware
        while(true) {
            gpio_put(LED_PIN, 1); sleep_ms(100);
            gpio_put(LED_PIN, 0); sleep_ms(100);
        }
    }
    printf("Driver do SD Card OK. Aguardando dados da urna...\n");
    
    while(true) {
        // O loop principal apenas verifica se a interrupção sinalizou uma nova mensagem
        if (new_message_received) {
            log_to_sd_card(uart_buffer);
            new_message_received = false; // Reseta a flag para aguardar a próxima
        }
        // O microcontrolador "dorme" aqui até a próxima interrupção (UART ou outra)
        // para economizar energia.
        __wfi(); // Wait For Interrupt
    }
    
    return 0;
}