#include "pico/cyw43_arch.h"
#include "pico/stdlib.h"
#include "lwip/tcp.h"
#include <string.h>
#include <stdio.h>

// Módulos da Urna
#include "hardware/i2c.h"
#include "ssd1306/ssd1306.h"
#include "hardware/pwm.h"

// Configurações do Wifi
#define WIFI_SSID "Redmi 13C"
#define WIFI_PASSWORD "12345678"

// Teclado Matricial 4x4
const uint ROW_PINS[] = {4, 8, 9, 16};
const uint COL_PINS[] = {17, 18, 19, 20};
const char KEY_MAP[4][4] = {
    {'1', '2', '3', 'A'}, // A = Confirma
    {'4', '5', '6', 'B'}, // B = Corrige
    {'7', '8', '9', 'C'}, // C = Encerra
    {'*', '0', '#', 'D'}  // D = Branco
};

// Display OLED
#define I2C_PORT i2c1
#define I2C_SDA_PIN 14
#define I2C_SCL_PIN 15
ssd1306_t disp;

// Buzzer
#define BUZZER_PIN 21

// Máquina de Estados da Urna
typedef enum {
    WAITING_FOR_START, // Esperando o mesário iniciar a eleição
    WAITING_FOR_ENABLE,// Estado de espera de permissão do mesário
    READY_TO_VOTE,     // Pronta para o eleitor digitar
    VOTING,            // Eleitor está digitando o número
    SHOWING_CANDIDATE, // Mostrando candidato para confirmação
    VOTE_CONFIRMED,    // Tela "FIM" após o voto
    ELECTION_ENDED     // Apresentando os resultados finais
} UrnaState;

// Estrutura para os Candidatos
typedef struct {
    char number[3];
    char name[16];
    int votes;
} Candidate;

// Mockup do banco de dados de candidatos e votos
Candidate candidates[] = {
    {"12", "Candidato A", 0},
    {"13", "Candidato B", 0}
};
const int NUM_CANDIDATES = 2;
int votes_blank = 0;
int votes_null = 0;

// Variáveis de estado globais
volatile UrnaState current_state = WAITING_FOR_START;
char current_vote_buffer[3] = "";
int input_pos = 0;
char http_response[2048]; // Buffer para a página HTML

// Protótipos

// void create_mesario_page();
static err_t http_callback(void *arg, struct tcp_pcb *tpcb, struct pbuf *p, err_t err);



// =============================================================================
// FUNÇÕES DE HARDWARE (OLED, BUZZER, TECLADO)
// =============================================================================

void setup_hardware() {
    // Teclado
    for (int i = 0; i < 4; i++) {
        gpio_init(ROW_PINS[i]);
        gpio_set_dir(ROW_PINS[i], GPIO_OUT);
        gpio_init(COL_PINS[i]);
        gpio_set_dir(COL_PINS[i], GPIO_IN);
        gpio_pull_down(COL_PINS[i]);
    }

    // Buzzer
    gpio_set_function(BUZZER_PIN, GPIO_FUNC_PWM);
    
    // OLED
    i2c_init(I2C_PORT, 400 * 1000);
    gpio_set_function(I2C_SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(I2C_SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(I2C_SDA_PIN);
    gpio_pull_up(I2C_SCL_PIN);
    disp.external_vcc = false;
    ssd1306_init(&disp, 128, 64, 0x3C, I2C_PORT);
}

void play_sound(uint freq, uint duration_ms) {
    uint slice_num = pwm_gpio_to_slice_num(BUZZER_PIN);
    pwm_set_enabled(slice_num, true);
    uint32_t wrap = 125000000 / freq; 
    pwm_set_wrap(slice_num, wrap);
    pwm_set_clkdiv(slice_num, 1);
    pwm_set_gpio_level(BUZZER_PIN, wrap / 2); // 50%
    sleep_ms(duration_ms);
    pwm_set_gpio_level(BUZZER_PIN, 0);
    pwm_set_enabled(slice_num, false);
}

void play_confirmation_sound() {
    play_sound(1200, 150);
    sleep_ms(50);
    play_sound(1500, 300);
}

char scan_keypad() {
    for (int r = 0; r < 4; r++) {
        gpio_put(ROW_PINS[r], 1);
        sleep_us(50);
        for (int c = 0; c < 4; c++) {
            if (gpio_get(COL_PINS[c])) {
                gpio_put(ROW_PINS[r], 0);
                return KEY_MAP[r][c];
            }
        }
        gpio_put(ROW_PINS[r], 0);
    }
    return '\0';
}

void update_oled_display() {
    ssd1306_clear(&disp);
    char line[32];

    switch(current_state) {
        case WAITING_FOR_START:
            ssd1306_draw_string(&disp, 0, 16, 1, "Aguardando inicio");
            ssd1306_draw_string(&disp, 0, 32, 1, "pelo aplicativo...");
            break;
        case WAITING_FOR_ENABLE:
            ssd1306_draw_string(&disp, 5, 16, 1, "Aguardando Mesario");
            ssd1306_draw_string(&disp, 15, 32, 1, "para habilitar...");
            break;
        case READY_TO_VOTE:
            ssd1306_draw_string(&disp, 10, 24, 2, "URNA PRONTA");
            break;
        case VOTING:
            ssd1306_draw_string(&disp, 0, 10, 1, "Numero:");
            ssd1306_draw_string(&disp, 40, 24, 3, current_vote_buffer);
            break;
        case SHOWING_CANDIDATE:
        {
            bool found = false;
            for (int i = 0; i < NUM_CANDIDATES; i++) {
                if (strcmp(current_vote_buffer, candidates[i].number) == 0) {
                    ssd1306_draw_string(&disp, 0, 0, 1, "Candidato:");
                    ssd1306_draw_string(&disp, 0, 16, 2, candidates[i].name);
                    found = true;
                    break;
                }
            }
            if (!found) {
                ssd1306_draw_string(&disp, 10, 16, 2, "VOTO NULO");
            }
            ssd1306_draw_string(&disp, 0, 48, 1, "A=Confirma B=Corrige");
            break;
        }
        case VOTE_CONFIRMED:
            ssd1306_draw_string(&disp, 45, 24, 3, "FIM");
            break;
        case ELECTION_ENDED:
            ssd1306_draw_string(&disp, 10, 0, 1, "-- RESULTADO --");
            for (int i = 0; i < NUM_CANDIDATES; i++) {
                sprintf(line, "%s (%s): %d", candidates[i].name, candidates[i].number, candidates[i].votes);
                ssd1306_draw_string(&disp, 0, 16 + (i * 10), 1, line);
            }
            sprintf(line, "Brancos: %d", votes_blank);
            ssd1306_draw_string(&disp, 0, 16 + (NUM_CANDIDATES * 10), 1, line);
            sprintf(line, "Nulos: %d", votes_null);
            ssd1306_draw_string(&disp, 0, 16 + ((NUM_CANDIDATES+1) * 10), 1, line);
            break;
    }
    ssd1306_show(&disp);
}

void reset_vote_state() {
    input_pos = 0;
    memset(current_vote_buffer, 0, sizeof(current_vote_buffer));
}


// =============================================================================
// LÓGICA DO SERVIDOR WEB (LWIP)
// =============================================================================

void create_status_json(char* buffer, size_t len) {
    snprintf(buffer, len,
        "{\"state\":%d, \"candA_votes\":%d, \"candB_votes\":%d, \"blank_votes\":%d}",
        current_state, candidates[0].votes, candidates[1].votes, votes_blank
    );
}

// void create_mesario_page() {
//     char election_status_str[50];
//     if (current_state == ELECTION_ENDED) strcpy(election_status_str, "VOTACAO ENCERRADA");
//     else if (current_state == WAITING_FOR_START) strcpy(election_status_str, "NAO INICIADA");
//     else strcpy(election_status_str, "EM ANDAMENTO");

//     snprintf(http_response, sizeof(http_response),
//              "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n"
//              "<!DOCTYPE html><html><head><title>Painel do Mesario</title>"
//              "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
//              "<meta http-equiv=\"refresh\" content=\"5\">" // Atualiza a página a cada 5 segundos
//              "<style> body { font-family: sans-serif; text-align: center; background-color: #f0f2f5; } "
//              "h1 { color: #0057A8; } h2 { color: #333; } .container { max-width: 600px; margin: auto; padding: 20px; } "
//              "a { display: block; padding: 15px 25px; margin: 10px auto; font-size: 1.2em; max-width: 300px; "
//              "color: white; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); } "
//              ".btn-start { background-color: #009B3A; } "
//              ".btn-enable { background-color: #0057A8; } "
//              ".btn-end { background-color: #dc3545; } .results { background-color: #fff; padding: 15px; border-radius: 8px; }</style></head>"
//              "<body><div class=\"container\"><h1>Painel do Mesario</h1>"
//              "<h2>Status da Eleicao: %s</h2>"
//              "<a href=\"/enable\" class=\"btn-enable\">HABILITAR PROXIMO ELEITOR</a>"
//              "<a href=\"/end\" class=\"btn-end\">ENCERRAR VOTACAO</a>"
//              "<a href=\"/start\" class=\"btn-start\">REINICIAR ELEICAO</a>"
//              "<div class=\"results\"><h3>Resultados Parciais:</h3>"
//              "<p>%s (%s): %d votos</p>"
//              "<p>%s (%s): %d votos</p>"
//              "<p>Brancos: %d votos</p>"
//              "<p>Nulos: %d votos</p></div>"
//              "</div></body></html>\r\n",
//              election_status_str, 
//              candidates[0].name, candidates[0].number, candidates[0].votes,
//              candidates[1].name, candidates[1].number, candidates[1].votes,
//              votes_blank, votes_null);
// }

static err_t http_callback(void *arg, struct tcp_pcb *tpcb, struct pbuf *p, err_t err) {
    if (p == NULL) {
        tcp_close(tpcb);
        return ERR_OK;
    }

    char *request = (char *)p->payload;

    // --- Lógica de Roteamento ---
    if (strstr(request, "GET /status")) {
        // Se a requisição for para o endpoint de status, retorna JSON
        char json_buffer[256];
        create_status_json(json_buffer, sizeof(json_buffer));
        
        // Envia a resposta com o cabeçalho de JSON
        tcp_write(tpcb, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n\r\n", 81, TCP_WRITE_FLAG_COPY);
        tcp_write(tpcb, json_buffer, strlen(json_buffer), TCP_WRITE_FLAG_COPY);

    } else {
        // Para qualquer outra requisição, processa os comandos e retorna a página HTML

        if (strstr(request, "GET /start")) {
            for (int i = 0; i < NUM_CANDIDATES; i++) candidates[i].votes = 0;
            votes_blank = 0; votes_null = 0;
            reset_vote_state();
            current_state = WAITING_FOR_ENABLE;
            printf("Eleicao iniciada/reiniciada pelo mesario.\n");
        } else if (strstr(request, "GET /enable")) {
            if (current_state == WAITING_FOR_ENABLE || current_state == VOTE_CONFIRMED) {
                reset_vote_state();
                current_state = READY_TO_VOTE;
                printf("Urna habilitada para o proximo eleitor.\n");
            }
        } else if (strstr(request, "GET /end")) {
            current_state = ELECTION_ENDED;
            printf("Eleicao encerrada pelo mesario.\n");
        }
        
        // create_mesario_page();
        tcp_write(tpcb, http_response, strlen(http_response), TCP_WRITE_FLAG_COPY);
    }
    
    pbuf_free(p);
    return ERR_OK;
}

static err_t connection_callback(void *arg, struct tcp_pcb *newpcb, err_t err) {
    tcp_recv(newpcb, http_callback);
    return ERR_OK;
}

static void start_http_server(void) {
    struct tcp_pcb *pcb = tcp_new_ip_type(IPADDR_TYPE_V4);
    if (!pcb) return;
    if (tcp_bind(pcb, IP_ADDR_ANY, 80) != ERR_OK) return;
    pcb = tcp_listen(pcb);
    tcp_accept(pcb, connection_callback);
    printf("Servidor HTTP iniciado na porta 80.\n");
}

// =============================================================================
// LÓGICA PRINCIPAL DA URNA
// =============================================================================

void urna_loop() {
    update_oled_display();

    if (current_state != READY_TO_VOTE && current_state != VOTING && current_state != SHOWING_CANDIDATE) {
        return; // Bloqueia o teclado se não estiver no estado de votação
    }
    
    char key = scan_keypad();
    if (key != '\0') {
        if (current_state == READY_TO_VOTE && (key >= '0' && key <= '9')) {
            current_state = VOTING;
        }
        
        if (current_state == VOTING) {
            if (key >= '0' && key <= '9' && input_pos < 2) {
                current_vote_buffer[input_pos++] = key;
                current_vote_buffer[input_pos] = '\0';
                play_sound(800, 100);
                if (input_pos == 2) {
                    current_state = SHOWING_CANDIDATE;
                }
            }
        }

        switch(key) {
            case 'A': // CONFIRMA
                if (current_state == SHOWING_CANDIDATE) {
                    bool found = false;
                    for (int i = 0; i < NUM_CANDIDATES; i++) {
                        if (strcmp(current_vote_buffer, candidates[i].number) == 0) {
                            candidates[i].votes++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        votes_null++;
                    }
                    current_state = VOTE_CONFIRMED;
                    update_oled_display();
                    play_confirmation_sound();
                    sleep_ms(2000);
                    reset_vote_state();
                    current_state = WAITING_FOR_ENABLE; // Pronta para o próximo
                }
                break;
            case 'B': // CORRIGE
                reset_vote_state();
                current_state = READY_TO_VOTE;
                break;
            case 'D': // BRANCO
                if (current_state == READY_TO_VOTE) {
                    votes_blank++;
                    current_state = VOTE_CONFIRMED;
                    update_oled_display();
                    play_confirmation_sound();
                    sleep_ms(2000);
                    reset_vote_state();
                    current_state = WAITING_FOR_ENABLE;
                }
                break;
        }

        while(scan_keypad() != '\0') { sleep_ms(20); } // Debounce
    }
}


int main() {
    stdio_init_all();
    sleep_ms(250);
    setup_hardware();

    if (cyw43_arch_init()) {
        printf("Erro ao inicializar o Wi-Fi\n");
        return 1;
    }

    cyw43_arch_enable_sta_mode();
    printf("Conectando ao Wi-Fi...\n");

    if (cyw43_arch_wifi_connect_timeout_ms(WIFI_SSID, WIFI_PASSWORD, CYW43_AUTH_WPA2_AES_PSK, 30000)) {
        printf("Falha ao conectar ao Wi-Fi\n");
        return 1;
    }
    printf("Conectado com sucesso!\n");
    printf("Acesse o painel do mesario em: http://%s\n", ip4addr_ntoa(netif_ip4_addr(netif_default)));

    start_http_server();

    while (true) {
        cyw43_arch_poll();
        urna_loop();
        sleep_ms(50);
    }
    return 0;
}