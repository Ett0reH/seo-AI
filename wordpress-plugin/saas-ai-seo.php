<?php
/**
 * Plugin Name: SaaS AI SEO Client
 * Plugin URI: https://example.com/saas-ai-seo
 * Description: Connects your WordPress site to the SaaS AI SEO platform to automatically generate semantic layers, schema.org, and AI-optimized content structures.
 * Version: 1.1.1
 * Author: SaaS AI SEO
 * License: GPL v2 or later
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class SaaS_AI_SEO_Plugin {
    
    private $option_api_key = 'saas_ai_seo_api_key';
    private $option_saas_url = 'saas_ai_seo_url';

    public function __construct() {
        // Admin Settings
        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);
        
        // Hooks for Content Changes
        add_action('save_post', [$this, 'handle_save_post'], 10, 3);
        
        // REST API for receiving data from SaaS
        add_action('rest_api_init', [$this, 'register_rest_routes']);
        
        // Frontend Injection
        add_action('wp_head', [$this, 'inject_semantic_layer'], 99);
    }

    /**
     * 1. ADMIN SETTINGS
     */
    public function add_settings_page() {
        add_options_page(
            'SaaS AI SEO Settings',
            'SaaS AI SEO',
            'manage_options',
            'saas-ai-seo',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings() {
        register_setting('saas_ai_seo_options', $this->option_api_key);
        register_setting('saas_ai_seo_options', $this->option_saas_url);
    }

    public function render_settings_page() {
        // Handle Test Connection
        $test_result = null;
        if (isset($_POST['test_saas_connection']) && check_admin_referer('test_saas_connection_nonce')) {
            $test_result = $this->test_connection();
        }

        ?>
        <div class="wrap">
            <h1>SaaS AI SEO Configuration <span style="font-size: 0.5em; color: #666; vertical-align: middle;">v1.1.1</span></h1>
            <p>Connect your WordPress site to the Semantic Layer SaaS.</p>
            
            <?php if ($test_result): ?>
                <div class="notice notice-<?php echo $test_result['success'] ? 'success' : 'error'; ?> is-dismissible">
                    <p><strong>Connection Test:</strong> <?php echo esc_html($test_result['message']); ?></p>
                    <?php if (!$test_result['success'] && !empty($test_result['details'])): ?>
                        <pre style="background:#f0f0f0; padding:10px;"><?php echo esc_html(print_r($test_result['details'], true)); ?></pre>
                    <?php endif; ?>
                </div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields('saas_ai_seo_options'); ?>
                <table class="form-table">
                    <tr valign="top">
                        <th scope="row">SaaS Endpoint URL</th>
                        <td>
                            <input type="url" name="<?php echo esc_attr($this->option_saas_url); ?>" 
                                   value="<?php echo esc_attr(get_option($this->option_saas_url)); ?>" 
                                   class="regular-text" placeholder="https://your-saas-app.run.app" required />
                            <p class="description">The base URL of your SaaS application.</p>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row">Shared Secret / API Key</th>
                        <td>
                            <input type="password" name="<?php echo esc_attr($this->option_api_key); ?>" 
                                   value="<?php echo esc_attr(get_option($this->option_api_key)); ?>" 
                                   class="regular-text" required />
                            <p class="description">Used to sign payloads securely between WordPress and the SaaS.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <hr>
            <h2>Troubleshooting</h2>
            <form method="post" action="">
                <?php wp_nonce_field('test_saas_connection_nonce'); ?>
                <p>Click the button below to test if WordPress can successfully send data to the SaaS.</p>
                <button type="submit" name="test_saas_connection" class="button button-secondary">Test Connection to SaaS</button>
            </form>
        </div>
        <?php
    }

    private function test_connection() {
        $api_key = trim(get_option($this->option_api_key));
        $saas_url = trim(get_option($this->option_saas_url));
        
        if (empty($api_key) || empty($saas_url)) {
            return ['success' => false, 'message' => 'Please save your URL and API Key first.'];
        }

        // Sanitize and ensure URL has scheme
        $saas_url = esc_url_raw($saas_url);
        if (!preg_match("~^(?:f|ht)tps?://~i", $saas_url)) {
            $saas_url = "https://" . $saas_url;
        }
        
        // Force HTTPS unless localhost to prevent 301 redirects that drop POST payloads
        if (strpos($saas_url, 'localhost') === false && strpos($saas_url, '127.0.0.1') === false) {
            $saas_url = preg_replace("/^http:/i", "https:", $saas_url);
        }
        
        $saas_url = rtrim($saas_url, '/');

        $payload_json = wp_json_encode(['test' => true, 'siteId' => parse_url(home_url(), PHP_URL_HOST)]);
        $signature = hash_hmac('sha256', $payload_json, $api_key);

        // Don't append /api/webhooks/wp if the user already included it in the URL
        if (!preg_match('#/api/webhooks/wp$#i', $saas_url)) {
            $saas_url .= '/api/webhooks/wp';
        }
        $webhook_url = $saas_url;

        $response = wp_remote_post($webhook_url, [
            'body'        => $payload_json,
            'headers'     => [
                'Content-Type'     => 'application/json',
                'X-SaaS-Signature' => $signature
            ],
            'timeout'     => 15, // Use a longer timeout for the test
            'blocking'    => true, // Blocking is true here so we can see the result
            'httpversion' => '1.1' // Force HTTP/1.1 to prevent 400 Bad Request from modern load balancers
        ]);

        if (is_wp_error($response)) {
            return [
                'success' => false, 
                'message' => 'WordPress failed to connect to the SaaS.',
                'details' => $response->get_error_message()
            ];
        }

        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code >= 200 && $status_code < 300) {
            return ['success' => true, 'message' => 'Connection successful! The SaaS received the test payload.'];
        }

        return [
            'success' => false, 
            'message' => 'SaaS returned an error status code: ' . $status_code,
            'details' => wp_remote_retrieve_body($response)
        ];
    }

    /**
     * 2. SEND DATA TO SAAS ON POST SAVE
     */
    public function handle_save_post($post_id, $post, $update) {
        // Skip autosaves, revisions, and non-published posts
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
        if ($post->post_status !== 'publish') return;

        $api_key = trim(get_option($this->option_api_key));
        $saas_url = trim(get_option($this->option_saas_url));
        
        if (empty($api_key) || empty($saas_url)) return;

        // Sanitize and ensure URL has scheme
        $saas_url = esc_url_raw($saas_url);
        if (!preg_match("~^(?:f|ht)tps?://~i", $saas_url)) {
            $saas_url = "https://" . $saas_url;
        }
        
        // Force HTTPS unless localhost to prevent 301 redirects that drop POST payloads
        if (strpos($saas_url, 'localhost') === false && strpos($saas_url, '127.0.0.1') === false) {
            $saas_url = preg_replace("/^http:/i", "https:", $saas_url);
        }
        
        $saas_url = rtrim($saas_url, '/');

        // Prepare Payload
        $payload_array = [
            'siteId'      => parse_url(home_url(), PHP_URL_HOST),
            'postId'      => $post_id,
            'postUrl'     => get_permalink($post_id),
            'postTitle'   => $post->post_title,
            'postContent' => wp_strip_all_tags($post->post_content), // Send clean text to LLM
            'wpRestUrl'   => rest_url('saas-ai-seo/v1/update-layer')
        ];
        
        $payload_json = wp_json_encode($payload_array);
        
        // Sign Payload with HMAC-SHA256
        $signature = hash_hmac('sha256', $payload_json, $api_key);

        // Don't append /api/webhooks/wp if the user already included it in the URL
        if (!preg_match('#/api/webhooks/wp$#i', $saas_url)) {
            $saas_url .= '/api/webhooks/wp';
        }
        $webhook_url = $saas_url;

        // Send Async Request to SaaS (blocking => false ensures WP doesn't hang)
        wp_remote_post($webhook_url, [
            'body'        => $payload_json,
            'headers'     => [
                'Content-Type'     => 'application/json',
                'X-SaaS-Signature' => $signature
            ],
            'timeout'     => 5,
            'blocking'    => false,
            'httpversion' => '1.1' // Force HTTP/1.1 to prevent 400 Bad Request
        ]);
    }

    /**
     * 3. RECEIVE DATA FROM SAAS (REST API)
     */
    public function register_rest_routes() {
        register_rest_route('saas-ai-seo/v1', '/update-layer', [
            'methods'             => WP_REST_Server::CREATABLE . ', ' . WP_REST_Server::EDITABLE,
            'callback'            => [$this, 'handle_update_layer'],
            'permission_callback' => '__return_true' // Authorization is handled via HMAC signature
        ]);
    }

    public function handle_update_layer(WP_REST_Request $request) {
        $api_key = get_option($this->option_api_key);
        if (empty($api_key)) {
            return new WP_Error('unauthorized', 'API key not configured', ['status' => 401]);
        }

        $signature = $request->get_header('x-saas-signature');
        if (!is_string($signature)) {
            $signature = '';
        }
        
        // Read payload from form data
        $payload = $request->get_param('payload');
        
        if (empty($payload)) {
            error_log('SaaS AI SEO: Empty payload received.');
            return new WP_Error('bad_request', 'Empty payload', ['status' => 400]);
        }

        // Ensure payload is a string for hash_hmac
        if (!is_string($payload)) {
            $payload = wp_json_encode($payload);
        }
        
        // Verify Signature FIRST
        $expected_signature = hash_hmac('sha256', $payload, $api_key);
        if (!hash_equals($expected_signature, $signature)) {
            error_log('SaaS AI SEO: Signature mismatch. Expected: ' . $expected_signature . ', Got: ' . $signature);
            return new WP_Error('unauthorized', 'Invalid HMAC signature', ['status' => 401]);
        }

        // Now it's safe to decode
        $data = json_decode($payload, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('SaaS AI SEO: Invalid JSON payload.');
            return new WP_Error('bad_request', 'Invalid JSON', ['status' => 400]);
        }

        $post_id = isset($data['postId']) ? intval($data['postId']) : 0;
        $json_ld = isset($data['jsonLd']) ? $data['jsonLd'] : []; // Default to empty array if missing

        if ($post_id) {
            // Save JSON-LD as post meta. wp_slash is required before update_post_meta for JSON strings.
            $json_string = is_string($json_ld) ? $json_ld : wp_json_encode($json_ld);
            // Removed the underscore prefix so it becomes visible in the WordPress Custom Fields UI
            update_post_meta($post_id, 'saas_ai_seo_json_ld', wp_slash($json_string));
            
            return rest_ensure_response(['success' => true, 'message' => 'Semantic layer updated']);
        }

        error_log('SaaS AI SEO: Missing postId. Received data: ' . print_r($data, true));
        return new WP_Error('bad_request', 'Missing postId', ['status' => 400]);
    }

    /**
     * 4. INJECT JSON-LD INTO FRONTEND
     */
    public function inject_semantic_layer() {
        if (is_singular()) {
            $post_id = get_the_ID();
            // Read from the new visible meta key
            $json_ld = get_post_meta($post_id, 'saas_ai_seo_json_ld', true);
            
            if (!empty($json_ld)) {
                echo "\n<!-- SaaS AI SEO Semantic Layer -->\n";
                echo "<script type=\"application/ld+json\">\n";
                // stripslashes is needed because update_post_meta unslashes, but we slashed it twice to preserve quotes
                echo stripslashes($json_ld) . "\n";
                echo "</script>\n";
                echo "<!-- End SaaS AI SEO -->\n";
            } else {
                // Debug comment to prove the hook is firing even if empty
                echo "\n<!-- SaaS AI SEO: No semantic layer found for this post -->\n";
            }
        }
    }
}

// Initialize Plugin
new SaaS_AI_SEO_Plugin();
