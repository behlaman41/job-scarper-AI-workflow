#!/bin/bash

# Job Scraper Automation Startup Script
# This script handles the complete setup and startup process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command_exists docker; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    log_success "Docker found"
    
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    log_success "Docker Compose found"
    
    if ! command_exists node; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    log_success "Node.js found"
}

# Install Node.js dependencies
install_dependencies() {
    log_info "Installing Node.js dependencies..."
    if [ -f "package.json" ]; then
        npm install
        log_success "Dependencies installed"
    else
        log_error "package.json not found"
        exit 1
    fi
}

# Check configuration
check_configuration() {
    log_info "Checking configuration..."
    
    if [ ! -f "config/config.json" ]; then
        log_error "Configuration file not found. Please run setup first."
        exit 1
    fi
    
    # Check if email is configured
    if grep -q "your-email@example.com" config/config.json; then
        log_warning "Email configuration not updated. Please run 'npm run setup-interactive' first."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    log_success "Configuration checked"
}

# Start Docker services
start_services() {
    log_info "Starting Docker services..."
    
    # Check if services are already running
    if docker-compose ps | grep -q "Up"; then
        log_warning "Some services are already running"
        read -p "Restart services? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose down
        fi
    fi
    
    # Start services
    docker-compose up -d
    log_success "Docker services started"
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for services to be ready..."
    
    # Wait for scraper service
    log_info "Waiting for scraper service..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/health >/dev/null 2>&1; then
            log_success "Scraper service is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Scraper service failed to start"
            exit 1
        fi
        sleep 2
    done
    
    # Wait for n8n service
    log_info "Waiting for n8n service..."
    for i in {1..30}; do
        if curl -s http://localhost:5678/healthz >/dev/null 2>&1; then
            log_success "n8n service is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "n8n service failed to start"
            exit 1
        fi
        sleep 2
    done
    
    # Wait for Ollama and model download
    log_info "Waiting for Ollama service and model download (this may take several minutes)..."
    OLLAMA_TAGS_URL=${OLLAMA_HOST:-http://localhost:11434}/api/tags
    TARGET_MODEL=${OLLAMA_MODEL}
    for i in {1..180}; do  # 6 minutes timeout
        if curl -s "$OLLAMA_TAGS_URL" >/dev/null 2>&1; then
            if [ -n "$TARGET_MODEL" ]; then
                if curl -s "$OLLAMA_TAGS_URL" | grep -q "$TARGET_MODEL"; then
                    log_success "Ollama service and model '$TARGET_MODEL' are ready"
                    break
                else
                    log_info "Ollama running; waiting for model '$TARGET_MODEL'... ($i/180)"
                fi
            else
                log_success "Ollama service is reachable"
                break
            fi
        fi
        if [ $i -eq 180 ]; then
            log_warning "Ollama service or model download timed out. You can continue but AI analysis may not work."
            break
        fi
        sleep 2
    done
}

# Run tests
run_tests() {
    log_info "Running system tests..."
    
    if node test.js; then
        log_success "All tests passed!"
    else
        log_warning "Some tests failed. Check the output above for details."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Show status and next steps
show_status() {
    log_info "System Status:"
    docker-compose ps
    
    echo
    log_success "🎉 Job Scraper Automation is ready!"
    echo
    log_info "📋 Next steps:"
    echo "1. Access n8n dashboard: http://localhost:5678"
    echo "2. Login with: admin / admin123"
    echo "3. Import workflow from workflows/daily-job-scraper.json"
    echo "4. Activate the workflow for daily automation"
    echo
    log_info "🔧 Useful commands:"
    echo "- View logs: npm run logs"
    echo "- Run tests: npm test"
    echo "- Stop services: npm run stop"
    echo "- Restart services: npm run restart"
    echo "- Manual scraping: npm run scrape"
    echo
    log_info "📖 For detailed instructions, see README.md"
}

# Main execution
main() {
    echo "🎯 Job Scraper Automation Startup"
    echo "=================================="
    echo
    
    check_prerequisites
    install_dependencies
    check_configuration
    start_services
    wait_for_services
    
    # Ask if user wants to run tests
    read -p "Run system tests? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        run_tests
    fi
    
    show_status
}

# Handle script arguments
case "${1:-}" in
    "--no-tests")
        # Skip tests
        check_prerequisites
        install_dependencies
        check_configuration
        start_services
        wait_for_services
        show_status
        ;;
    "--help")
        echo "Usage: $0 [--no-tests] [--help]"
        echo "  --no-tests  Skip running system tests"
        echo "  --help      Show this help message"
        ;;
    *)
        main
        ;;
esac
