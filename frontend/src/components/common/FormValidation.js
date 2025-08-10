// frontend/src/components/common/FormValidation.js
// Form validation utilities and components

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

// Validation rules
export const ValidationRules = {
  required: (value, fieldName = 'Field') => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return `${fieldName} is required`;
    }
    return null;
  },

  minLength: (min) => (value, fieldName = 'Field') => {
    if (value && value.length < min) {
      return `${fieldName} must be at least ${min} characters long`;
    }
    return null;
  },

  maxLength: (max) => (value, fieldName = 'Field') => {
    if (value && value.length > max) {
      return `${fieldName} must be less than ${max} characters`;
    }
    return null;
  },

  email: (value, fieldName = 'Email') => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return `${fieldName} must be a valid email address`;
    }
    return null;
  },

  number: (value, fieldName = 'Field') => {
    if (value && isNaN(Number(value))) {
      return `${fieldName} must be a valid number`;
    }
    return null;
  },

  range: (min, max) => (value, fieldName = 'Field') => {
    const num = Number(value);
    if (value && (num < min || num > max)) {
      return `${fieldName} must be between ${min} and ${max}`;
    }
    return null;
  },

  positiveInteger: (value, fieldName = 'Field') => {
    const num = parseInt(value);
    if (value && (isNaN(num) || num < 1 || !Number.isInteger(num))) {
      return `${fieldName} must be a positive integer`;
    }
    return null;
  },

  time: (value, fieldName = 'Time') => {
    if (value && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
      return `${fieldName} must be in HH:MM format`;
    }
    return null;
  },

  teamName: (value, fieldName = 'Team name') => {
    if (value) {
      if (value.length < 2) {
        return `${fieldName} must be at least 2 characters long`;
      }
      if (value.length > 100) {
        return `${fieldName} must be less than 100 characters`;
      }
      if (!/^[a-zA-Z0-9\s\-_.]+$/.test(value)) {
        return `${fieldName} can only contain letters, numbers, spaces, hyphens, underscores, and periods`;
      }
    }
    return null;
  }
};

// Field validation hook
export const useFieldValidation = (initialValue = '', validators = []) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const validate = (val = value) => {
    for (const validator of validators) {
      const error = validator(val);
      if (error) {
        setError(error);
        return false;
      }
    }
    setError('');
    return true;
  };

  const handleChange = (newValue) => {
    setValue(newValue);
    if (touched) {
      validate(newValue);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    validate();
  };

  const reset = () => {
    setValue(initialValue);
    setError('');
    setTouched(false);
  };

  return {
    value,
    error,
    touched,
    isValid: !error,
    setValue: handleChange,
    onBlur: handleBlur,
    validate: () => validate(),
    reset
  };
};

// Form validation hook for multiple fields
export const useFormValidation = (fieldConfigs) => {
  const [fields, setFields] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize fields
  React.useEffect(() => {
    const initialFields = {};
    Object.entries(fieldConfigs).forEach(([name, config]) => {
      initialFields[name] = {
        value: config.initialValue || '',
        error: '',
        touched: false,
        validators: config.validators || []
      };
    });
    setFields(initialFields);
  }, []);

  const validateField = (fieldName, value) => {
    const field = fields[fieldName];
    if (!field) return true;

    for (const validator of field.validators) {
      const error = validator(value, fieldConfigs[fieldName]?.label || fieldName);
      if (error) {
        setFields(prev => ({
          ...prev,
          [fieldName]: { ...prev[fieldName], error }
        }));
        return false;
      }
    }

    setFields(prev => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], error: '' }
    }));
    return true;
  };

  const validateAllFields = () => {
    let isValid = true;
    Object.keys(fields).forEach(fieldName => {
      const fieldIsValid = validateField(fieldName, fields[fieldName].value);
      if (!fieldIsValid) isValid = false;
    });
    return isValid;
  };

  const handleFieldChange = (fieldName, value) => {
    setFields(prev => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], value }
    }));

    if (fields[fieldName]?.touched) {
      validateField(fieldName, value);
    }
  };

  const handleFieldBlur = (fieldName) => {
    setFields(prev => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], touched: true }
    }));
    validateField(fieldName, fields[fieldName].value);
  };

  const resetForm = () => {
    Object.entries(fieldConfigs).forEach(([name, config]) => {
      setFields(prev => ({
        ...prev,
        [name]: {
          ...prev[name],
          value: config.initialValue || '',
          error: '',
          touched: false
        }
      }));
    });
    setIsSubmitting(false);
  };

  const getFieldProps = (fieldName) => ({
    value: fields[fieldName]?.value || '',
    error: fields[fieldName]?.error || '',
    touched: fields[fieldName]?.touched || false,
    isValid: !fields[fieldName]?.error,
    onChange: (value) => handleFieldChange(fieldName, value),
    onBlur: () => handleFieldBlur(fieldName)
  });

  const getFormData = () => {
    const data = {};
    Object.keys(fields).forEach(name => {
      data[name] = fields[name].value;
    });
    return data;
  };

  return {
    fields,
    isSubmitting,
    setIsSubmitting,
    validateAllFields,
    resetForm,
    getFieldProps,
    getFormData
  };
};

// Validated Input Component
export const ValidatedInput = ({ 
  label, 
  type = 'text', 
  placeholder, 
  value, 
  error, 
  touched, 
  onChange, 
  onBlur, 
  required = false,
  helpText,
  className = '',
  ...props 
}) => {
  const hasError = touched && error;
  const isValid = touched && !error && value;

  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-sm font-semibold mb-2 text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`
            w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 
            transition-colors duration-200
            ${hasError 
              ? 'border-red-500 focus:ring-red-200 bg-red-50' 
              : isValid 
                ? 'border-green-500 focus:ring-green-200 bg-green-50'
                : 'border-gray-300 focus:ring-blue-200 focus:border-blue-500'
            }
          `}
          {...props}
        />
        
        {/* Status icons */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {hasError && <AlertCircle className="w-5 h-5 text-red-500" />}
          {isValid && <CheckCircle className="w-5 h-5 text-green-500" />}
        </div>
      </div>
      
      {/* Help text */}
      {helpText && !hasError && (
        <div className="mt-1 flex items-center text-sm text-gray-600">
          <Info className="w-4 h-4 mr-1" />
          {helpText}
        </div>
      )}
      
      {/* Error message */}
      {hasError && (
        <div className="mt-1 flex items-center text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </div>
      )}
    </div>
  );
};

// Validated Textarea Component
export const ValidatedTextarea = ({ 
  label, 
  placeholder, 
  value, 
  error, 
  touched, 
  onChange, 
  onBlur, 
  required = false,
  rows = 4,
  className = '',
  ...props 
}) => {
  const hasError = touched && error;
  const isValid = touched && !error && value;

  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-sm font-semibold mb-2 text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className={`
          w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 
          transition-colors duration-200 resize-vertical
          ${hasError 
            ? 'border-red-500 focus:ring-red-200 bg-red-50' 
            : isValid 
              ? 'border-green-500 focus:ring-green-200 bg-green-50'
              : 'border-gray-300 focus:ring-blue-200 focus:border-blue-500'
          }
        `}
        {...props}
      />
      
      {/* Error message */}
      {hasError && (
        <div className="mt-1 flex items-center text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </div>
      )}
    </div>
  );
};

// Form submission helper
export const handleFormSubmit = async (formValidation, onSubmit, showMessage) => {
  formValidation.setIsSubmitting(true);
  
  try {
    if (!formValidation.validateAllFields()) {
      showMessage('Please fix the errors in the form', true);
      return false;
    }
    
    const formData = formValidation.getFormData();
    const result = await onSubmit(formData);
    
    if (result.success !== false) {
      formValidation.resetForm();
      return true;
    } else {
      showMessage(result.error || 'An error occurred', true);
      return false;
    }
  } catch (error) {
    showMessage(error.message || 'An unexpected error occurred', true);
    return false;
  } finally {
    formValidation.setIsSubmitting(false);
  }
};